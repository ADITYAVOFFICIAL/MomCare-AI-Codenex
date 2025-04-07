// src/lib/gemini.ts

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  ChatSession, // Keep importing the type from the SDK
  GenerateContentResult,
  StartChatParams,
  Content, // Import Content type from the SDK
  BlockReason, // Import BlockReason for better type checking
  FinishReason // Import FinishReason for better type checking
} from "@google/generative-ai";
import { format, parseISO, isAfter } from 'date-fns'; // Import necessary date-fns functions

// Import types from Appwrite (ensure path is correct)
// UserProfile now includes the new fields (previousPregnancies as number)
import {
  UserProfile,
  BloodPressureReading,
  BloodSugarReading,
  WeightReading,
  Appointment
} from "./appwrite"; // Assuming appwrite.ts is in the same directory

// --- Type Definitions ---
// Define and export types directly used within this module and potentially elsewhere.

/**
* User preferences gathered from the pre-chat form.
*/
export interface UserPreferences {
feeling?: string;
age?: number;
weeksPregnant?: number; // From form (used as override/fallback)
preExistingConditions?: string; // From form (used as override/fallback)
specificConcerns?: string; // From form
}

/**
* Structure for additional context fetched from Appwrite and passed to the chat.
*/
export interface AdditionalChatContext {
  latestBp: BloodPressureReading | null;
  latestSugar: BloodSugarReading | null;
  latestWeight: WeightReading | null;
  // Ensure Appointment type includes the processed 'dateTime' if added in ChatPage
  upcomingAppointments: (Appointment & { dateTime?: Date | null })[];
}

/**
* Structure for chat messages, aligning with the Gemini SDK's Content structure.
*/
export interface ChatMessage {
role: 'user' | 'model';
parts: { text: string }[];
}

// --- Configuration ---
const API_KEY: string | undefined = import.meta.env.VITE_PUBLIC_GEMINI_API_KEY;
const MODEL_NAME: string = "gemini-2.0-flash"; // Consider making this configurable via env var if needed

if (!API_KEY) {
// Log a critical error, but avoid throwing here to allow potential fallback/UI handling
console.error("CRITICAL: VITE_PUBLIC_GEMINI_API_KEY environment variable is not set. Gemini service will be unavailable.");
}

// --- Initialization ---
// Initialize the AI client only if the API key is available.
const genAI: GoogleGenerativeAI | null = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// Standard generation configuration for the model.
const generationConfig = {
temperature: 0.7, // Balances creativity and predictability
topK: 40,         // Considers the top K most likely tokens
topP: 0.95,       // Uses nucleus sampling
maxOutputTokens: 2048, // Maximum length of the generated response
};

// Safety settings to block harmful content. Adjust thresholds as needed.
// BLOCK_ONLY_HIGH is generally safer for sensitive topics.
const safetySettings = [
{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
{ category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }, // Stricter for explicit content
{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// --- Helper Functions ---

/**
* Formats a date string (ISO or YYYY-MM-DD) into 'MMM d, yyyy'.
* Returns 'unknown date' on failure.
* @param dateString The date string to format.
* @returns Formatted date string or 'unknown date'.
*/
const formatDateSafe = (dateString: string | undefined): string => {
  if (!dateString) return 'unknown date';
  try {
      // Handle both 'YYYY-MM-DD' and full ISO strings robustly
      const date = parseISO(dateString.includes('T') ? dateString : `${dateString}T00:00:00Z`);
      // Check if the parsed date is valid before formatting
      if (isNaN(date.getTime())) {
          return 'invalid date';
      }
      return format(date, 'MMM d, yyyy');
  } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return 'error formatting date';
  }
};

/**
* Formats a health reading object into a readable string for AI context.
* Includes a disclaimer about medical interpretation.
* @param reading The health reading object (BP, Sugar, or Weight).
* @param type The type of reading ('BP', 'Sugar', 'Weight').
* @returns A formatted string describing the reading or unavailability.
*/
const formatReadingForContext = (reading: BloodPressureReading | BloodSugarReading | WeightReading | null, type: 'BP' | 'Sugar' | 'Weight'): string => {
  if (!reading) return `No recent ${type} reading available.`;

  const dateStr = formatDateSafe(reading.recordedAt);
  let readingStr = '';

  switch (type) {
      case 'BP':
          // Type guard to ensure reading is BloodPressureReading
          if ('systolic' in reading && 'diastolic' in reading) {
              readingStr = `BP: ${reading.systolic}/${reading.diastolic} mmHg`;
          }
          break;
      case 'Sugar':
          // Type guard for BloodSugarReading
          if ('level' in reading && 'measurementType' in reading) {
              readingStr = `Blood Sugar: ${reading.level} mg/dL (${reading.measurementType || 'unspecified'})`;
          }
          break;
      case 'Weight':
          // Type guard for WeightReading
          if ('weight' in reading && 'unit' in reading) {
              readingStr = `Weight: ${reading.weight} ${reading.unit || 'units'}`;
          }
          break;
      default:
          // Should not happen with defined types, but good practice
          return `Unknown reading type: ${type}`;
  }

  // Return empty string if type guard failed (shouldn't happen with proper usage)
  if (!readingStr) return `Could not format ${type} reading.`;

  return `${readingStr} (Logged on ${dateStr}. For context only, do not interpret medically.)`;
};

/**
* Formats upcoming appointments into a readable list for AI context.
* @param appointments An array of Appointment objects, potentially processed with dateTime.
* @returns A formatted string listing upcoming appointments or indicating none.
*/
const formatAppointmentsForContext = (appointments: (Appointment & { dateTime?: Date | null })[]): string => {
  if (!appointments || appointments.length === 0) return 'No upcoming appointments logged.';

  const formattedList = appointments
      .map(app => {
          // Use the pre-calculated dateTime if available, otherwise format the date string
          const dateStr = app.dateTime
              ? format(app.dateTime, 'MMM d, yyyy h:mm a') // Format with time
              : formatDateSafe(app.date); // Format date only as fallback
          const type = app.appointmentType?.replace(/_/g, ' ') || 'appointment'; // Make type more readable
          return `- ${type} on ${dateStr}`;
      })
      .join('\n'); // Join with newlines

  return `Upcoming Appointments:\n${formattedList}`;
};

/**
* Creates the initial system prompt incorporating all available user context.
* This prompt guides the AI's persona, rules, and awareness of user details.
* @param userPrefs Data from the pre-chat form.
* @param profileData Fetched UserProfile data from Appwrite (can be null).
* @param additionalContext Fetched latest readings and appointments.
* @returns A string containing the complete system prompt.
*/
const createSystemPrompt = (
  userPrefs: UserPreferences,
  profileData: UserProfile | null,
  additionalContext: AdditionalChatContext
): string => {

  // --- Determine Best Source for Each Piece of Info ---
  // Prioritize profile data, fallback to form preferences or defaults.
  const name = profileData?.name || 'User';
  const age = profileData?.age ?? userPrefs.age;
  const weeksPregnant = userPrefs.weeksPregnant ?? profileData?.weeksPregnant;
  const conditions = profileData?.preExistingConditions || userPrefs.preExistingConditions;
  const feeling = userPrefs.feeling;
  const concerns = userPrefs.specificConcerns;

  // --- Format Context Sections ---
  // Build the context string piece by piece for clarity.
  let contextString = "[User Context]\n";
  contextString += `- Name: ${name}\n`;
  if (age) contextString += `- Age: ${age}\n`;
  if (weeksPregnant !== undefined) contextString += `- Weeks Pregnant: ${weeksPregnant}\n`; else contextString += "- Weeks Pregnant: Not specified\n";
  if (conditions) contextString += `- Pre-existing Conditions: ${conditions}\n`; else contextString += "- Pre-existing Conditions: None mentioned\n";
  if (feeling) contextString += `- Current Feeling: ${feeling}\n`;
  if (concerns) contextString += `- Specific Concerns Today: ${concerns}\n`;

  // Add detailed profile info if available
  if (profileData) {
      if (profileData.previousPregnancies !== undefined && profileData.previousPregnancies >= 0) {
          contextString += `- Number of Previous Pregnancies: ${profileData.previousPregnancies}\n`;
      }
      if (profileData.deliveryPreference) {
          contextString += `- Stated Delivery Preference: ${profileData.deliveryPreference}\n`;
      }
      if (profileData.partnerSupport) {
          contextString += `- Partner Support Level Mentioned: ${profileData.partnerSupport}\n`; // Use cautiously
      }
      if (profileData.workSituation) {
          contextString += `- Work Situation: ${profileData.workSituation}\n`;
      }
      if (profileData.dietaryPreferences && profileData.dietaryPreferences.length > 0) {
          contextString += `- Dietary Preferences/Restrictions: ${profileData.dietaryPreferences.join(', ')}\n`;
      }
      if (profileData.activityLevel) {
          contextString += `- General Activity Level: ${profileData.activityLevel}\n`;
      }
      // chatTonePreference is handled in Persona Instructions below
  }

  // Add Health Readings Context (with disclaimers)
  contextString += "\n[Recent Health Readings (Context Only - DO NOT Interpret Medically)]\n";
  contextString += `${formatReadingForContext(additionalContext.latestBp, 'BP')}\n`;
  contextString += `${formatReadingForContext(additionalContext.latestSugar, 'Sugar')}\n`;
  contextString += `${formatReadingForContext(additionalContext.latestWeight, 'Weight')}\n`;

  // Add Appointments Context
  contextString += "\n[Upcoming Schedule Context]\n";
  contextString += `${formatAppointmentsForContext(additionalContext.upcomingAppointments)}\n`;

  // --- Define AI Persona and Rules ---
  // Clearly define the AI's role, tone, and limitations.
  const personaInstructions = `
[AI Persona & Role]
You are MomCare AI, an empathetic, knowledgeable, and supportive AI assistant focused on providing general information and emotional support for pregnant individuals. Your tone should be warm, reassuring, and clear. Prioritize safety and evidence-based information where applicable.
${/* Incorporate Chat Tone Preference if available */''}
${profileData?.chatTonePreference ? `The user prefers a tone that is primarily: ${profileData.chatTonePreference}. Please adjust your responses accordingly while maintaining empathy and safety.\n` : ''}
Your primary goal is to be helpful and informative within the bounds of safety. Acknowledge user feelings and concerns. Use the provided context to tailor general information but avoid making assumptions or giving specific advice based on it without qualification.
`;

  // Define strict safety rules, especially regarding medical advice.
  const safetyRules = `
[CRITICAL SAFETY RULES & BOUNDARIES]
1.  **NO MEDICAL ADVICE:** You MUST NOT provide medical diagnoses, treatment plans, medication suggestions (even OTC), or interpret specific medical results (like exact BP numbers or blood sugar levels). Do not comment directly on the normalcy or risk associated with readings like BP, sugar, or weight.
2.  **DEFER TO PROFESSIONALS:** ALWAYS strongly advise the user to consult their doctor, midwife, or other qualified healthcare professional for any personal medical questions, symptoms, diagnosis, or treatment. Use phrases like "It's best to discuss this specific symptom with your doctor," or "Your healthcare provider can give you the most accurate advice for your situation."
3.  **GENERAL INFORMATION ONLY:** Provide only general, evidence-based information about pregnancy topics (common symptoms, nutrition guidelines, typical development, preparation). You can mention general considerations related to context (e.g., "For individuals with [condition], doctors often recommend... but please confirm with your provider").
4.  **USE CONTEXT CAREFULLY:** You can use the provided user context (profile details like number of previous pregnancies, delivery preference, activity level, dietary preferences, readings, appointments) to make your *general* information more relevant and empathetic. For example: "Knowing you have had ${profileData?.previousPregnancies ?? 'previous'} pregnancies might influence how you approach certain preparations..." or "Considering your preference for [delivery type], you might want to ask your doctor about..." or "With a [activity level] activity level, gentle exercises like... might be suitable, but check first." or "Regarding nutrition, keeping your preference for [dietary preference] in mind, general advice includes...". Do NOT draw medical conclusions or give specific instructions based on the context. Do not say "Your BP reading of X is high." Instead, say "It's always good to keep track of your BP readings and discuss the trends with your provider." Acknowledge dietary preferences when discussing nutrition generally. Be mindful and respectful when referencing sensitive information like partner support, perhaps by acknowledging the user's situation broadly if relevant, without making assumptions.
5.  **EMERGENCY REDIRECTION:** If the user describes potentially urgent symptoms (severe pain, heavy bleeding, reduced fetal movement, signs of preeclampsia, etc.), immediately and clearly advise them to contact their healthcare provider or seek emergency care right away. Do not attempt to diagnose or downplay the symptom.
6.  **SCOPE LIMITATION:** Clearly state you cannot access external websites, specific medical records (beyond context provided), or book appointments.
7.  **PRIVACY & SENSITIVITY:** Be respectful of all provided information, especially potentially sensitive details like partner support. Do not probe for more sensitive details. Acknowledge context gently.
`;

  // Combine all parts into the final system prompt.
  return `${personaInstructions}\n${contextString}\n${safetyRules}`;
};


// --- Core API Functions ---

/**
* Starts a new chat session with the Gemini model, incorporating enhanced user context.
* Handles initialization errors gracefully.
* @param userPrefs User preferences from the pre-chat form.
* @param profileData Fetched UserProfile data from Appwrite (can be null).
* @param additionalContext Fetched latest readings and appointments.
* @returns The initialized ChatSession object.
* @throws Error if the AI client is not initialized or chat fails to start.
*/
export const startChat = async (
  userPrefs: UserPreferences,
  profileData: UserProfile | null,
  additionalContext: AdditionalChatContext
): Promise<ChatSession> => {
// Ensure the AI client is initialized (API key was provided)
if (!genAI) {
    console.error('Gemini AI client not initialized. Check API Key environment variable.');
    throw new Error('AI service is not available. Please check configuration.');
}

try {
    // Generate the comprehensive system prompt
    const systemPrompt = createSystemPrompt(userPrefs, profileData, additionalContext);

    // Log the system prompt for debugging (consider reducing verbosity in production)
    console.log("--- Gemini System Prompt ---");
    console.log(systemPrompt);
    console.log("--------------------------");

    // Get the generative model instance
    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        // systemInstruction: systemPrompt, // Use this if supported by your SDK version for better separation
        generationConfig,
        safetySettings,
    });

    // Determine user's name and feeling for the initial greeting message
    const name = profileData?.name || (userPrefs.feeling ? 'User' : 'there'); // Use profile name or fallback
    const feeling = userPrefs.feeling || 'reaching out';
    const weeksPregnant = userPrefs.weeksPregnant ?? profileData?.weeksPregnant;
    const weekMention = weeksPregnant !== undefined ? ` at ${weeksPregnant} weeks` : '';
    const concernMention = userPrefs.specificConcerns ? ` You also mentioned some concerns about: ${userPrefs.specificConcerns}.` : '';

    // Construct the initial chat history.
    // Method 1: Include system prompt in history if `systemInstruction` is not used/supported.
    const initialHistory: Content[] = [
         { role: "user", parts: [{ text: systemPrompt }] },
         { role: "model", parts: [{ text: "Understood. I will follow these instructions and safety guidelines, using the provided context appropriately." }] }, // AI acknowledges prompt internally

        // User's implicit first turn based on pre-chat form
        {
            role: "user",
            parts: [{ text: `Hi, I'm feeling ${feeling}${weekMention}.${concernMention}` }]
        },
        // Model's initial *visible* response to the user
        {
            role: "model",
            parts: [{ text: `Hello ${name}! Thanks for reaching out. It's completely understandable to feel ${feeling}${weekMention}. I have the context you shared and from your profile to help inform our conversation.\n\nPlease remember, I'm here to provide general information and support, but I cannot offer medical advice. It's crucial to talk to your doctor or midwife about any personal health questions or symptoms.\n\nHow can I help you today?` }]
        }
    ];

    // Prepare parameters for starting the chat session
    const chatParams: StartChatParams = {
        history: initialHistory,
        // If using systemInstruction:
        // systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }
    };

    // Start the chat session
    const chat = model.startChat(chatParams);

    console.log("Chat session started successfully with enhanced context.");
    return chat;

} catch (error: unknown) {
    console.error('Error starting chat session:', error);
    // Provide more specific error messages based on potential issues
    if (error instanceof Error) {
        if (error.message.includes('API key not valid')) {
             throw new Error('Failed to start chat: Invalid API Key.');
        }
        if (error.message.includes('quota')) {
             throw new Error('Failed to start chat: API quota exceeded.');
        }
    }
    // Generic fallback error
    throw new Error('Failed to start chat session. Please check connection/API key and try again.');
}
};

/**
* Sends a message to an ongoing chat session and gets the complete response.
* Handles potential blocking and finish reasons.
* @param chatSession The active ChatSession object.
* @param message The user's message string.
* @returns The model's text response string.
* @throws Error if the session is invalid, message sending fails, or response is unusable.
*/
export const sendMessage = async (
chatSession: ChatSession,
message: string
): Promise<string> => {
if (!chatSession) {
    console.error("sendMessage called with uninitialized chat session.");
    throw new Error("Chat session is not initialized.");
}
if (!message || message.trim().length === 0) {
    console.warn("sendMessage called with empty message.");
    return "[Empty message received]"; // Or handle as appropriate
}

try {
    console.log(`Sending message: "${message}"`);
    const result: GenerateContentResult = await chatSession.sendMessage(message);
    const response = result.response;

    // Check if a response object exists
    if (!response) {
        console.error("sendMessage Error: No response object received from the AI.");
        throw new Error("The AI did not provide a response.");
    }

    // Check for blocking reasons first
    const blockReason: BlockReason | undefined = response.promptFeedback?.blockReason;
    if (blockReason) {
        console.warn(`Message blocked due to: ${blockReason}`);
        // Provide a user-friendly message indicating the block
        return `I apologize, but I can't respond to that specific request due to safety guidelines (${blockReason}). Could we perhaps talk about something else related to your pregnancy journey? Remember to consult your doctor for medical advice.`;
    }

    // Check for other non-STOP finish reasons
    const finishReason: FinishReason | undefined = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== FinishReason.STOP) {
        console.warn(`Response finished due to reason: ${finishReason}`);
         // Handle specific non-STOP reasons
         if (finishReason === FinishReason.SAFETY) {
              return `I couldn't fully complete that response due to safety guidelines. Please ask differently or consult your healthcare provider.`;
         } else if (finishReason === FinishReason.MAX_TOKENS) {
              // Return the partial text even if cut short
              const text = response.text();
              return text + "\n\n[My response was cut short because it reached the maximum length. Feel free to ask me to continue or ask a more specific question.]";
         } else {
             // Handle other reasons like RECITATION, OTHER
             return `My response generation stopped unexpectedly (${finishReason}). Please try rephrasing your message.`;
         }
    }

    // If not blocked and finished with STOP, return the text
    const text = response.text();
    if (!text && (!response.candidates || response.candidates.length === 0)) {
        console.warn("sendMessage Warning: Response received but contains no text content.");
        return "[AI response was empty]"; // Indicate empty response
    }
    console.log(`Received response: "${text}"`);
    return text;

} catch (error: unknown) {
    console.error('Error sending message:', error);
    // Provide specific error messages
    if (error instanceof Error) {
        if (error.message.includes('quota')) {
             throw new Error('Failed to send message: API usage limit reached.');
        }
        if (error.message.includes('FETCH_ERROR') || error.message.includes('NetworkError')) {
             throw new Error('Failed to send message: Network error. Please check your connection.');
        }
    }
    // Generic fallback
    throw new Error('Failed to send message. Please try again later.');
}
};

/**
* Sends a message and streams the response back chunk by chunk.
* Handles errors, blocking, and finish reasons during the stream.
* @param chatSession The active ChatSession object.
* @param message The user's message string.
* @param onChunk Callback function executed for each received chunk of text.
* @param onError Callback function executed if an error occurs during streaming.
* @param onComplete Callback function executed when streaming finishes successfully.
*/
export const sendMessageStream = async (
chatSession: ChatSession,
message: string,
onChunk: (chunk: string) => void,
onError: (error: Error) => void,
onComplete: () => void
): Promise<void> => {
 if (!chatSession) {
     onError(new Error("Chat session is not initialized."));
     return;
 }
 if (!message || message.trim().length === 0) {
     onError(new Error("Cannot send an empty message."));
     return;
 }

try {
    console.log(`Sending message (stream): "${message}"`);
    const result = await chatSession.sendMessageStream(message);

    let blockedMessageSent = false;
    let finalFinishReason: FinishReason | null = null;
    let accumulatedText = ""; // To potentially check if any text was sent before block/error

    // Process the stream chunk by chunk
    for await (const chunk of result.stream) {
        // Check for blocking reasons within the chunk's feedback
        const chunkBlockReason = chunk.promptFeedback?.blockReason;
        if (chunkBlockReason && !blockedMessageSent) {
            console.warn(`Stream blocked during generation: ${chunkBlockReason}`);
            onChunk(`\n[My response was interrupted due to safety guidelines (${chunkBlockReason}). Please ask differently. Remember to consult your doctor for medical advice.]`);
            blockedMessageSent = true; // Stop processing further text chunks for this message
        }

        // Store the finish reason if provided in a chunk's candidate
        const chunkFinishReason = chunk.candidates?.[0]?.finishReason;
        if (chunkFinishReason && chunkFinishReason !== FinishReason.STOP) {
            finalFinishReason = chunkFinishReason;
        }

        // Process text content only if the stream hasn't been marked as blocked
        if (!blockedMessageSent) {
            try {
                const chunkText = chunk.text();
                if (chunkText) { // Ensure chunkText is not empty
                    accumulatedText += chunkText;
                    onChunk(chunkText); // Send valid text chunk to the UI
                }
            } catch (chunkError) {
                // Log error processing a specific chunk but attempt to continue stream
                console.error("Error processing stream chunk:", chunkError);
                // Optionally, inform the user via onChunk or onError
                // onError(new Error("Error processing part of the response.")); // Could be too disruptive
            }
        }
    } // End of stream loop

    // After the stream loop, get the final aggregated response object for final checks
    const finalResponse = await result.response;

    // Double-check final response feedback for blocks, especially if no chunks indicated one
    const finalBlockReason = finalResponse.promptFeedback?.blockReason;
     if (finalBlockReason && !blockedMessageSent) {
        console.warn(`Final response feedback indicates block reason: ${finalBlockReason}`);
         onChunk(`\n[My response couldn't be fully completed due to safety guidelines (${finalBlockReason}). Please ask differently or consult your healthcare provider.]`);
         blockedMessageSent = true;
    }

     // Check finishReason from the final response if not caught during the stream
     const responseFinishReason = finalResponse.candidates?.[0]?.finishReason;
     if (!finalFinishReason && responseFinishReason && responseFinishReason !== FinishReason.STOP) {
         finalFinishReason = responseFinishReason;
     }

     // Handle non-STOP finish reasons after the stream, only if not already blocked
     if (finalFinishReason && finalFinishReason !== FinishReason.STOP && !blockedMessageSent) {
          console.warn(`Stream finished due to reason: ${finalFinishReason}`);
          if (finalFinishReason === FinishReason.SAFETY) {
               onChunk(`\n[My response generation was stopped due to safety guidelines. Please rephrase or consult your provider.]`);
          } else if (finalFinishReason === FinishReason.MAX_TOKENS) {
               onChunk(`\n[My response may be incomplete as it reached the maximum length. Ask me to continue or ask a more specific question.]`);
          } else if (finalFinishReason === FinishReason.RECITATION) {
               onChunk(`\n[My response was stopped as it may have contained copyrighted material.]`);
          } else {
               onChunk(`\n[My response generation stopped unexpectedly (${finalFinishReason}).]`);
          }
     }

    // If the stream finished without critical errors or being blocked early, call onComplete
    console.log("Message stream processing completed.");
    onComplete();

} catch (error: unknown) {
    console.error('Error sending message stream:', error);
    let userError = new Error('Failed to process message stream. Please try again.'); // Default error
     if (error instanceof Error) {
         if (error.message.includes('quota')) {
             userError = new Error('Failed to send message: API usage limit reached.');
         } else if (error.message.includes('API key not valid')) {
             userError = new Error('Authentication error. Please check configuration.');
         } else if (error.message.includes('FETCH_ERROR') || error.message.includes('NetworkError')) {
             userError = new Error('Network error. Please check your connection and try again.');
         } else {
             // Use the original error message if it's somewhat informative
             userError = new Error(`Failed to process stream: ${error.message}`);
         }
     }
    onError(userError); // Pass the constructed error to the UI callback
    // Do not call onComplete here as an error occurred
}
};


// --- Service Object Export ---
// Encapsulate the functions into a service object for cleaner imports.
const geminiService = {
startChat,
sendMessage,
sendMessageStream,
// Expose config or client if needed externally, but generally keep internal
};

export default geminiService;

// --- Type Re-exports ---
// Only re-export types that are *imported* into this module and might be needed elsewhere.
// Do NOT re-export types defined within this file (ChatMessage, UserPreferences, AdditionalChatContext)
// as they are already exported directly via `export interface`.
export type { ChatSession }; // Re-export ChatSession type from the SDK if needed by callers