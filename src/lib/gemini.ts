// src/lib/gemini.ts

import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
    ChatSession,
    GenerateContentResult,
    StartChatParams,
    Content,
    Part, // Keep Part type for multimodal input
    BlockReason,
    FinishReason
} from "@google/generative-ai";
import { format, parseISO } from 'date-fns';

// --- *** IMPORT Appwrite types instead of redefining them *** ---
import {
    UserProfile,
    BloodPressureReading,
    BloodSugarReading,
    WeightReading,
    Appointment
    // Import other Appwrite types if needed directly here
} from "./appwrite"; // Adjust path if needed

// --- Type Definitions Specific to Gemini Interaction ---

/** User preferences collected from the pre-chat form */
export interface UserPreferences {
    feeling?: string;
    age?: number; // From form, might override profile
    weeksPregnant?: number; // From form, might override profile
    preExistingConditions?: string; // From form, might override profile
    specificConcerns?: string; // From form
}

/** Context passed to Gemini, now using imported Appwrite types */
export interface AdditionalChatContext {
    latestBp: BloodPressureReading | null; // Uses imported type
    latestSugar: BloodSugarReading | null; // Uses imported type
    latestWeight: WeightReading | null; // Uses imported type
    // Uses imported Appointment type, extended with optional parsed dateTime
    upcomingAppointments: (Appointment & { dateTime?: Date | null })[];
    previousConcerns: string[]; // Array of recent user message contents
}

/** Structure for chat messages used in UI state and potentially history */
export interface ChatMessage {
    role: 'user' | 'model';
    // Gemini can return multiple parts (e.g., text, function calls),
    // but for UI we primarily care about text.
    // If handling function calls, you'd extend this.
    parts: { text: string }[];
}

// --- Configuration ---
const API_KEY: string | undefined = import.meta.env.VITE_PUBLIC_GEMINI_API_KEY;
// Use a model that supports vision (text and image input)
const MODEL_NAME: string = "gemini-1.5-flash";

if (!API_KEY) {
    console.error("CRITICAL: VITE_PUBLIC_GEMINI_API_KEY environment variable is not set. Gemini service will be unavailable.");
    // Consider throwing an error or displaying a message in the UI
}

// --- Initialization ---
const genAI: GoogleGenerativeAI | null = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const generationConfig = {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 4096,
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// --- Helper Functions ---

/**
* Formats a date string (ISO or YYYY-MM-DD) into 'MMM d, yyyy'.
* Returns 'unknown date' on failure.
*/
const formatDateSafe = (dateString: string | undefined): string => {
    if (!dateString) return 'unknown date';
    try {
        // Handle both full ISO strings and date-only strings by assuming UTC if no time/zone info
        const date = parseISO(dateString.includes('T') ? dateString : `${dateString}T00:00:00Z`);
        if (isNaN(date.getTime())) {
            console.warn(`Invalid date string encountered: ${dateString}`);
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
*/
const formatReadingForContext = (reading: BloodPressureReading | BloodSugarReading | WeightReading | null, type: 'BP' | 'Sugar' | 'Weight'): string => {
    if (!reading) return `No recent ${type} reading available.`;
    // Use the 'recordedAt' field which should be an ISO string
    const dateStr = formatDateSafe(reading.recordedAt);
    let readingStr = '';
    switch (type) {
        case 'BP':
            // Type guard to ensure properties exist
            if ('systolic' in reading && 'diastolic' in reading) {
                readingStr = `BP: ${reading.systolic}/${reading.diastolic} mmHg`;
            }
            break;
        case 'Sugar':
            if ('level' in reading && 'measurementType' in reading) {
                readingStr = `Blood Sugar: ${reading.level} mg/dL (${reading.measurementType || 'unspecified'})`;
            }
            break;
        case 'Weight':
            if ('weight' in reading && 'unit' in reading) {
                readingStr = `Weight: ${reading.weight} ${reading.unit || 'units'}`;
            }
            break;
        default:
            // Should not happen with TypeScript, but good practice
            console.warn(`Unknown reading type encountered: ${type}`);
            return `Unknown reading type: ${type}`;
    }
    if (!readingStr) return `Could not format ${type} reading.`;
    return `${readingStr} (Logged on ${dateStr}. For context only, do not interpret medically.)`;
};

/**
* Formats upcoming appointments into a readable list for AI context.
*/
const formatAppointmentsForContext = (appointments: (Appointment & { dateTime?: Date | null })[]): string => {
    if (!appointments || appointments.length === 0) return 'No upcoming appointments logged.';
    const formattedList = appointments
        .map(app => {
            // Use the pre-parsed dateTime if available, otherwise format the date string
            const dateStr = app.dateTime
                ? format(app.dateTime, 'MMM d, yyyy h:mm a') // Format with time if parsed
                : formatDateSafe(app.date); // Format date only if time parsing failed or wasn't done
            const type = app.appointmentType?.replace(/_/g, ' ') || 'appointment'; // Make type more readable
            return `- ${type} on ${dateStr}`;
        })
        .join('\n');
    return `Upcoming Appointments:\n${formattedList}`;
};

/**
* Formats previously mentioned concerns from chat history for AI context.
*/
const formatPreviousConcernsForContext = (concerns: string[]): string => {
    if (!concerns || concerns.length === 0) return 'No specific recent concerns noted in chat history.';
    // Take the last few concerns and format them
    const formattedList = concerns
        .slice(-3) // Limit to last 3 for brevity
        .map(concern => `- "${concern.substring(0, 100)}${concern.length > 100 ? '...' : ''}"`) // Truncate long concerns
        .join('\n');
    return `Recent Topics/Concerns Mentioned by User (for conversational memory):\n${formattedList}`;
};

/**
* Creates the initial system prompt incorporating all available user context.
* Uses the imported Appwrite types for profileData and additionalContext.
*/
const createSystemPrompt = (
    userPrefs: UserPreferences,
    profileData: UserProfile | null, // Uses imported UserProfile type
    additionalContext: AdditionalChatContext // Uses imported types within
): string => {
    // --- Determine Context ---
    const name = profileData?.name || 'User';
    // Use profile age first, then fallback to form age
    const age = profileData?.age ?? userPrefs.age;
    // Use form weeks first (override), then fallback to profile weeks
    const weeksPregnant = userPrefs.weeksPregnant ?? profileData?.weeksPregnant;
    // Use form conditions first (override), then fallback to profile conditions
    const conditions = userPrefs.preExistingConditions || profileData?.preExistingConditions;
    const feeling = userPrefs.feeling;
    const concerns = userPrefs.specificConcerns;

    // --- Format Context Sections ---
    let contextString = "[User Context]\n";
    contextString += `- Name: ${name}\n`;
    if (age) contextString += `- Age: ${age}\n`;
    if (weeksPregnant !== undefined) contextString += `- Weeks Pregnant: ${weeksPregnant}\n`; else contextString += "- Weeks Pregnant: Not specified\n";
    if (conditions) contextString += `- Pre-existing Conditions: ${conditions}\n`; else contextString += "- Pre-existing Conditions: None mentioned\n";
    if (feeling) contextString += `- Current Feeling: ${feeling}\n`;
    if (concerns) contextString += `- Specific Concerns Today: ${concerns}\n`;

    // Add more details from the full UserProfile if available
    if (profileData) {
        if (profileData.previousPregnancies !== undefined && profileData.previousPregnancies >= 0) contextString += `- Number of Previous Pregnancies: ${profileData.previousPregnancies}\n`;
        if (profileData.deliveryPreference) contextString += `- Stated Delivery Preference: ${profileData.deliveryPreference}\n`;
        if (profileData.partnerSupport) contextString += `- Partner Support Level Mentioned: ${profileData.partnerSupport}\n`;
        if (profileData.workSituation) contextString += `- Work Situation: ${profileData.workSituation}\n`;
        if (profileData.dietaryPreferences && profileData.dietaryPreferences.length > 0) contextString += `- Dietary Preferences/Restrictions: ${profileData.dietaryPreferences.join(', ')}\n`;
        if (profileData.activityLevel) contextString += `- General Activity Level: ${profileData.activityLevel}\n`;
    }

    contextString += "\n[Recent Health Readings (Context Only - DO NOT Interpret Medically)]\n";
    contextString += `${formatReadingForContext(additionalContext.latestBp, 'BP')}\n`;
    contextString += `${formatReadingForContext(additionalContext.latestSugar, 'Sugar')}\n`;
    contextString += `${formatReadingForContext(additionalContext.latestWeight, 'Weight')}\n`;

    contextString += "\n[Upcoming Schedule Context]\n";
    contextString += `${formatAppointmentsForContext(additionalContext.upcomingAppointments)}\n`;

    contextString += "\n[Recent Chat Context (Memory Aid)]\n";
    contextString += `${formatPreviousConcernsForContext(additionalContext.previousConcerns)}\n`;

    // --- Define AI Persona and Rules ---
    const personaInstructions = `
[AI Persona & Role]
You are MomCare AI, an empathetic, knowledgeable, and supportive AI assistant focused on providing general information and emotional support for pregnant individuals. Your tone should be warm, reassuring, and clear. Prioritize safety and evidence-based information where applicable.
${/* --- DYNAMIC TONE INSERTION --- */ ''}
${profileData?.chatTonePreference ? `The user prefers a tone that is primarily: ${profileData.chatTonePreference}. Adjust your responses accordingly while maintaining empathy and safety.\n` : ''}
${/* --- END DYNAMIC TONE INSERTION --- */ ''}
Your primary goal is to be helpful and informative within safety bounds. Acknowledge feelings and concerns. Use provided context (profile, readings, schedule, recent chat topics) to tailor general information but avoid specific advice without qualification. Pay attention to recurring themes or symptoms and acknowledge them gently.
`;

    const safetyRules = `
[CRITICAL SAFETY RULES & BOUNDARIES]
1.  **NO MEDICAL ADVICE:** MUST NOT provide diagnoses, treatment plans, medication suggestions, or interpret specific medical results. Do not comment on normalcy/risk of readings.
2.  **DEFER TO PROFESSIONALS:** ALWAYS strongly advise consulting a doctor for personal medical questions, symptoms, diagnosis, or treatment. Use phrases like "It's best to discuss this with your doctor," or "Your healthcare provider can give accurate advice."
3.  **GENERAL INFORMATION ONLY:** Provide only general, evidence-based pregnancy info (symptoms, nutrition, development). *Sometimes* include links to reputable sources (ACOG, Mayo Clinic, CDC) using Markdown: [Source Name](URL).
4.  **USE CONTEXT CAREFULLY:** Use profile details, readings, schedule, *and recent chat topics* for relevance and empathy. Examples: "Knowing you had previous pregnancies...", "Considering your preference for [delivery type]...", "With a [activity level] activity level...", "Regarding nutrition with [dietary preference]...", "I see you recently asked about [previous concern]...". Do NOT draw medical conclusions. Do NOT say "Your BP reading is high." Instead: "Discuss BP trends with your provider." Acknowledge sensitive info respectfully.
5.  **EMERGENCY REDIRECTION:** If user describes urgent symptoms (severe pain, heavy bleeding, reduced fetal movement, preeclampsia signs), IMMEDIATELY and CLEARLY advise contacting their provider or seeking emergency care. Do not diagnose or downplay and redirect to /emergency page with href so that they can click the link and redirect to the "/emergency" page.
6.  **SCOPE LIMITATION & IMAGE HANDLING:** State you can access external websites (beyond providing links), specific medical records, or book appointments. **Crucially, you CAN SEE and process images.** If the user sends an image part, acknowledge receiving it. You can describe the image if asked. Always recommend showing any visual symptoms (like rashes, swelling, etc.) directly to their healthcare provider for proper assessment. Example response if user sends image of rash: "Thank you for sharing the image. I can see there's a red area on the skin. For any visual concerns like a rash, it's always best to show it to your doctor directly so they can examine it properly and give you the right advice."
7.  **PRIVACY & SENSITIVITY:** Be respectful. Do not probe for sensitive details. Acknowledge context gently.
`;

    return `${personaInstructions}\n${contextString}\n${safetyRules}`;
};


/**
 * Converts a browser File object into a GoogleGenerativeAI.Part object
 * suitable for inline data (Base64). Includes MIME type guessing as fallback.
 */
export const fileToGenerativePart = async (file: File): Promise<Part> => {
    // Promise to read file as Base64
    const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64Data = dataUrl.split(',')[1]; // Extract Base64 part
            if (base64Data) { resolve(base64Data); }
            else { reject(new Error("Failed to extract Base64 data from file.")); }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file); // Read file
    });

    const base64Data = await base64EncodedDataPromise;
    let mimeType = file.type;

    // Fallback MIME type guessing if browser didn't provide it
    if (!mimeType) {
        console.warn("File type (MIME type) is missing. Attempting to guess based on extension.");
        const extension = file.name.split('.').pop()?.toLowerCase();
        switch (extension) {
            case 'png': mimeType = 'image/png'; break;
            case 'jpg': case 'jpeg': mimeType = 'image/jpeg'; break;
            case 'webp': mimeType = 'image/webp'; break;
            case 'heic': mimeType = 'image/heic'; break;
            case 'heif': mimeType = 'image/heif'; break;
            case 'gif': mimeType = 'image/gif'; break; // Added GIF
            default:
                console.error(`Could not guess MIME type for file extension: ${extension}`);
                throw new Error("File type (MIME type) is missing and could not be guessed. Please ensure the file has a standard image extension.");
        }
        console.warn(`Guessed MIME type as: ${mimeType}`);
    }

    // Optional: Validate against known supported types by the Gemini model
    const supportedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
    if (!supportedTypes.includes(mimeType)) {
        console.warn(`Unsupported MIME type for Gemini: ${mimeType}. The API might reject this image.`);
        // Consider throwing an error here if you want stricter client-side validation
        // throw new Error(`Unsupported image type: ${mimeType}. Please use PNG, JPEG, WEBP, HEIC, HEIF, or GIF.`);
    }

    return {
        inlineData: {
            data: base64Data,
            mimeType: mimeType // Use the determined MIME type
        },
    };
};


// --- Core API Functions ---

/**
* Starts a new chat session with the Gemini model, incorporating enhanced user context.
* Uses the imported Appwrite types for profileData and additionalContext.
*/
export const startChat = async (
    userPrefs: UserPreferences,
    profileData: UserProfile | null, // Uses imported UserProfile type
    additionalContext: AdditionalChatContext // Uses imported types within
): Promise<ChatSession> => {
    if (!genAI) { throw new Error('AI service is not available. Check configuration.'); }

    try {
        const systemPromptText = createSystemPrompt(userPrefs, profileData, additionalContext);
        console.log("--- Gemini System Prompt (First 500 chars) ---");
        console.log(systemPromptText.substring(0, 500) + "...");
        console.log("---------------------------------------------");

        // System instruction format for Gemini 1.5
        const systemInstruction: Content = { role: "system", parts: [{ text: systemPromptText }] };

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: systemInstruction, // Pass system prompt here
            generationConfig,
            safetySettings
        });

        // Prepare initial user message based on pre-chat form
        const name = profileData?.name || (userPrefs.feeling ? 'User' : 'there');
        const feeling = userPrefs.feeling || 'reaching out';
        const weeksPregnant = userPrefs.weeksPregnant ?? profileData?.weeksPregnant;
        const weekMention = weeksPregnant !== undefined ? ` at ${weeksPregnant} weeks` : '';
        const concernMention = userPrefs.specificConcerns ? ` You also mentioned concerns about: ${userPrefs.specificConcerns}.` : '';
        const initialUserText = `Hi, I'm feeling ${feeling}${weekMention}.${concernMention}`;

        // Initial history for the API call (system prompt handled by model config)
        const initialHistory: Content[] = [
            { role: "user", parts: [{ text: initialUserText }] },
            // Initial AI response acknowledging context and setting boundaries
            { role: "model", parts: [{ text: `Hello ${name}! Thanks for reaching out. It's completely understandable to feel ${feeling}${weekMention}. I have the context you shared (profile, health data, schedule, recent topics) to help inform our conversation.\n\nPlease remember, I'm here for general information and support. I can process images you send, but I cannot offer medical advice or interpret them medically. It's crucial to talk to your doctor about any personal health questions, symptoms, or visual concerns.\n\nHow can I help you today?` }] }
        ];

        const chatParams: StartChatParams = { history: initialHistory };
        const chat = model.startChat(chatParams);
        console.log("Chat session started successfully with enhanced context.");
        return chat;

    } catch (error: unknown) {
        console.error('Error starting chat session:', error);
        if (error instanceof Error) {
            if (error.message.includes('API key not valid')) throw new Error('Failed to start chat: Invalid API Key.');
            if (error.message.includes('quota')) throw new Error('Failed to start chat: API quota exceeded.');
            if (error.message.includes('Unsupported')) throw new Error(`Failed to start chat: Model configuration issue (${error.message}).`);
            // Add more specific error checks if needed
        }
        // Throw a more generic error for the UI
        throw new Error('Failed to start chat session. Please check connection/API key/model settings.');
    }
};

/**
* Sends a message (text and/or image parts) to an ongoing chat session and gets the complete response.
*/
export const sendMessage = async (
    chatSession: ChatSession,
    content: (string | Part)[] // Accept array of text/image parts
): Promise<string> => {
    if (!chatSession) { throw new Error("Chat session is not initialized."); }
    if (!content || content.length === 0) {
        console.warn("sendMessage called with empty content.");
        return "[Empty message received]"; // Or handle as appropriate
    }

    // Log content (indicate if image present)
    const logContent = content.map(part => typeof part === 'string' ? part : '[Image Part]').join(' ');
    console.log(`Sending message: "${logContent.substring(0, 100)}..."`);

    try {
        const result: GenerateContentResult = await chatSession.sendMessage(content);
        const response = result.response;

        if (!response) {
            // This case might indicate an issue before generation even started
            console.error("sendMessage Error: No response object received from Gemini.");
            throw new Error("The AI did not provide a response object.");
        }

        // Check for blocking reasons in prompt feedback
        const blockReason: BlockReason | undefined = response.promptFeedback?.blockReason;
        if (blockReason) {
            console.warn(`Message blocked due to prompt feedback: ${blockReason}. Reason: ${response.promptFeedback?.blockReasonMessage}`);
            if (response.promptFeedback?.blockReasonMessage?.toLowerCase().includes('image')) {
                return `I apologize, but there was an issue processing the image (${blockReason}). Please ensure it's a supported format and within size limits. Remember, I cannot interpret images medically.`;
            }
            return `I apologize, but I can't respond to that specific request due to safety guidelines (${blockReason}). Could we perhaps talk about something else? Remember to consult your doctor for medical advice.`;
        }

        // Check for finish reasons in candidate
        const finishReason: FinishReason | undefined = response.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== FinishReason.STOP) {
            console.warn(`Response finished abnormally. Reason: ${finishReason}`);
            if (finishReason === FinishReason.SAFETY) {
                // Safety block during generation
                return `I couldn't fully complete that response due to safety guidelines. Please ask differently or consult your healthcare provider.`;
            } else if (finishReason === FinishReason.MAX_TOKENS) {
                const text = response.text(); // Get potentially partial text
                return text + "\n\n[My response was cut short as it reached the maximum length.]";
            } else if (finishReason === FinishReason.RECITATION) {
                return `My response was stopped as it may have contained copyrighted material.`;
            } else {
                // Other reasons like API error, unspecified, etc.
                return `My response generation stopped unexpectedly (${finishReason}). Please try rephrasing or try again later.`;
            }
        }

        // Get the response text
        const text = response.text();

        // Handle cases where response is technically successful but has no text content
        if (!text && (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content)) {
            console.warn("sendMessage Warning: Response received but contains no text content, despite STOP finish reason.");
            // Check if the input contained an image, maybe the AI just acknowledged it internally
            const hadImageInput = content.some(part => typeof part !== 'string');
            if (hadImageInput) {
                // Provide a default acknowledgement if AI gives nothing back after image
                return "[Acknowledged image. How else can I help, or please describe your concern.]";
            }
            return "[AI response was empty]"; // Default for other empty cases
        }

        console.log(`Received response: "${text.substring(0, 100)}..."`);
        return text;

    } catch (error: unknown) {
        console.error('Error sending message:', error);
        // Provide more user-friendly error messages based on common issues
        if (error instanceof Error) {
            if (error.message.includes('quota')) throw new Error('Failed to send message: API usage limit reached.');
            if (error.message.includes('FETCH_ERROR') || error.message.includes('NetworkError')) throw new Error('Failed to send message: Network error. Please check your connection.');
            // Handle potential image-related errors (400 Bad Request often indicates this)
            if (error.message.toLowerCase().includes('image') || error.message.includes('400')) {
                throw new Error(`Failed to process the message, possibly due to the image. Ensure it's a supported format (PNG, JPEG, WEBP, HEIC, HEIF, GIF) and within size limits (around 4MB).`);
            }
            if (error.message.includes('API key not valid')) throw new Error('Authentication error. Please check your API key.');
            // Fallback for other errors
            throw new Error(`Failed to send message: ${error.message}`);
        }
        // Generic fallback
        throw new Error('Failed to send message due to an unknown error. Please try again later.');
    }
};

/**
* Sends a message (text and/or image parts) and streams the response back chunk by chunk.
*/
export const sendMessageStream = async (
    chatSession: ChatSession,
    content: (string | Part)[], // Accept array of text/image parts
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
): Promise<void> => {
    if (!chatSession) { onError(new Error("Chat session is not initialized.")); return; }
    if (!content || content.length === 0) { onError(new Error("Cannot send empty content.")); return; }

    // Log content (indicate if image present)
    const logContent = content.map(part => typeof part === 'string' ? part : '[Image Part]').join(' ');
    console.log(`Sending message (stream): "${logContent.substring(0, 100)}..."`);

    try {
        const result = await chatSession.sendMessageStream(content);

        let blockedMessageSent = false; // Flag to avoid sending multiple block messages
        let finalFinishReason: FinishReason | null = null; // Store the first non-STOP reason
        let accumulatedText = ""; // Track all received text

        // Process the stream chunk by chunk
        for await (const chunk of result.stream) {
            // Check for blocking reasons *within* the stream chunks' prompt feedback
            const chunkBlockReason = chunk.promptFeedback?.blockReason;
            if (chunkBlockReason && !blockedMessageSent) {
                console.warn(`Stream blocked during generation (prompt feedback): ${chunkBlockReason}. Reason: ${chunk.promptFeedback?.blockReasonMessage}`);
                if (chunk.promptFeedback?.blockReasonMessage?.toLowerCase().includes('image')) {
                    onChunk(`\n[My response was interrupted due to an issue processing the image (${chunkBlockReason}). Please ensure it's supported and within limits.]`);
                } else {
                    onChunk(`\n[My response was interrupted due to safety guidelines (${chunkBlockReason}). Please ask differently. Remember to consult your doctor.]`);
                }
                blockedMessageSent = true; // Prevent further text processing
            }

            // Check finish reason in candidates (might indicate safety block during generation)
            const chunkFinishReason = chunk.candidates?.[0]?.finishReason;
            if (chunkFinishReason && chunkFinishReason !== FinishReason.STOP) {
                if (!finalFinishReason) finalFinishReason = chunkFinishReason; // Store the first non-STOP reason
                if (chunkFinishReason === FinishReason.SAFETY && !blockedMessageSent) {
                     console.warn(`Stream stopped during generation due to: ${chunkFinishReason}`);
                     onChunk(`\n[My response generation was stopped due to safety guidelines.]`);
                     blockedMessageSent = true; // Prevent further text processing
                }
            }

            // Process text chunk only if not blocked
            if (!blockedMessageSent) {
                try {
                    const chunkText = chunk.text();
                    if (chunkText) {
                        accumulatedText += chunkText;
                        onChunk(chunkText); // Send valid text chunk to UI
                    }
                } catch (chunkError) {
                    console.error("Error processing stream chunk text:", chunkError);
                    // Optionally send a notification about chunk error
                    // onChunk("\n[Error processing part of the response.]");
                }
            }
        } // End of stream loop

        // --- Post-Stream Checks ---
        // Check the final aggregated response feedback (catches blocks not caught mid-stream)
        const finalResponse = await result.response;
        const finalBlockReason = finalResponse.promptFeedback?.blockReason;
        if (finalBlockReason && !blockedMessageSent) {
            console.warn(`Final response feedback indicates block reason: ${finalBlockReason}. Reason: ${finalResponse.promptFeedback?.blockReasonMessage}`);
            if (finalResponse.promptFeedback?.blockReasonMessage?.toLowerCase().includes('image')) {
                onChunk(`\n[My response couldn't be fully completed due to an issue processing the image (${finalBlockReason}).]`);
            } else {
                onChunk(`\n[My response couldn't be fully completed due to safety guidelines (${finalBlockReason}).]`);
            }
            blockedMessageSent = true;
        }

        // Determine the definitive final finish reason
        const responseFinishReason = finalResponse.candidates?.[0]?.finishReason;
        if (!finalFinishReason && responseFinishReason && responseFinishReason !== FinishReason.STOP) {
            finalFinishReason = responseFinishReason; // Use final response's reason if stream didn't provide one
        }

        // Handle non-STOP finish reasons if not already blocked
        if (finalFinishReason && finalFinishReason !== FinishReason.STOP && !blockedMessageSent) {
            console.warn(`Stream finished abnormally. Final Reason: ${finalFinishReason}`);
            // Note: SAFETY case handled mid-stream usually, but check again just in case
            if (finalFinishReason === FinishReason.SAFETY) onChunk(`\n[My response generation was stopped due to safety guidelines.]`);
            else if (finalFinishReason === FinishReason.MAX_TOKENS) onChunk(`\n[My response may be incomplete as it reached the maximum length.]`);
            else if (finalFinishReason === FinishReason.RECITATION) onChunk(`\n[My response was stopped as it may have contained copyrighted material.]`);
            else onChunk(`\n[My response generation stopped unexpectedly (${finalFinishReason}).]`);
        }

        // Handle case where stream completed successfully but generated no text
        if (accumulatedText.trim().length === 0 && !blockedMessageSent && finalFinishReason === FinishReason.STOP) {
            const hadImageInput = content.some(part => typeof part !== 'string');
            if (hadImageInput) {
                console.log("Stream completed with no text output, likely acknowledging image as per prompt.");
                onChunk("[Acknowledged image. How else can I help, or please describe your concern.]"); // Provide default acknowledgement
            } else {
                console.warn("Stream completed successfully but generated no text content.");
                onChunk("[AI response was empty]"); // Placeholder for empty text response
            }
        }

        console.log("Message stream processing completed.");
        onComplete(); // Signal successful completion of the stream processing

    } catch (error: unknown) {
        console.error('Error sending message stream:', error);
        let userError = new Error('Failed to process message stream. Please try again.'); // Default
        // Provide more specific user-facing errors
        if (error instanceof Error) {
            if (error.message.includes('quota')) userError = new Error('Failed to send message: API usage limit reached.');
            else if (error.message.includes('API key not valid')) userError = new Error('Authentication error. Please check API key.');
            else if (error.message.includes('FETCH_ERROR') || error.message.includes('NetworkError')) userError = new Error('Network error. Please check your connection.');
            else if (error.message.toLowerCase().includes('image') || error.message.includes('400')) {
                userError = new Error(`Failed to process message, possibly due to the image. Ensure it's supported (PNG, JPEG, etc.) and within size limits.`);
            }
            // Fallback including original message for debugging if needed
            else userError = new Error(`Failed to process stream: ${error.message}`);
        }
        onError(userError); // Signal error to the caller
    }
};


// --- Service Object Export ---
const geminiService = {
    startChat,
    sendMessage,
    sendMessageStream,
    fileToGenerativePart // Export the helper function
};

export default geminiService;

// --- Type Re-exports ---
// Re-export Part if needed by callers (e.g., the UI component handling file uploads)
// Re-export ChatSession if needed for state typing in the component
export type { ChatSession, Part };