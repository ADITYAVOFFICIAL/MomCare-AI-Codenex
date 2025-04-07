// src/lib/gemini.ts

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  ChatSession,
  GenerateContentResult,
  StartChatParams,
  Content // Import Content type from the SDK
} from "@google/generative-ai";
// Assuming UserProfile is correctly imported or defined if needed here
import { UserProfile } from "./appwrite"; // Adjust path if needed
import { isBefore, differenceInWeeks } from 'date-fns'; // Import date-fns functions

// Define types for chat messages and user preferences
export interface ChatMessage {
  role: 'user' | 'model';
  // Aligning with SDK's Content structure which uses 'parts' array
  parts: { text: string }[];
}

export interface UserPreferences {
  feeling?: string;
  age?: number;
  weeksPregnant?: number; // From form (used as fallback)
  preExistingConditions?: string; // From form (used as fallback)
  specificConcerns?: string; // From form
  location?: string; // Optional location context
}

// --- Configuration ---
const API_KEY = import.meta.env.VITE_PUBLIC_GEMINI_API_KEY;
// Use a model suitable for chat, like flash (faster, cheaper) or pro (more capable)
const MODEL_NAME = "gemini-1.5-flash"; // Or "gemini-1.5-pro", "gemini-pro"

if (!API_KEY) {
  console.error("CRITICAL: VITE_PUBLIC_GEMINI_API_KEY environment variable is not set.");
  // Throwing an error might be better in production to prevent app malfunction
  // throw new Error("VITE_PUBLIC_GEMINI_API_KEY environment variable is not set.");
}

// --- Initialization ---
// Ensure API_KEY is checked before initializing
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const generationConfig = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 1500, // Adjust based on expected response length
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  // Note: There isn't a specific HARM_CATEGORY_MEDICAL. Rely on prompt instructions.
];

// --- Helper Functions ---

/**
* Calculates weeks pregnant based on month of conception (YYYY-MM format).
* Returns null if calculation is not possible or invalid.
*/
const calculateWeeksPregnant = (monthOfConception: string | undefined): number | null => {
  if (!monthOfConception || !/^\d{4}-\d{2}$/.test(monthOfConception)) return null; // Basic format check
  try {
      const conceptionDate = new Date(monthOfConception + '-01T00:00:00Z'); // Start of month UTC
      if (isNaN(conceptionDate.getTime())) return null;

      const today = new Date();
      if (isBefore(today, conceptionDate)) return 0;

      const weeks = differenceInWeeks(today, conceptionDate);
      // Return weeks within a reasonable pregnancy range
      return weeks >= 0 && weeks <= 45 ? weeks : null;
  } catch (e) {
      console.error("Error calculating weeks pregnant:", e);
      return null;
  }
};

/**
* Creates the initial chat history including system instructions and user context.
* @param userPrefs Data from the pre-chat form
* @param profileData Fetched UserProfile data from Appwrite (can be null)
* @returns Array of Content objects for starting the chat
*/
const createInitialChatHistory = (userPrefs: UserPreferences, profileData: UserProfile | null): Content[] => {
  // Determine the best source for context, prioritizing profile data
  const name = profileData?.name || 'there';
  const age = profileData?.age ?? userPrefs.age ?? 'Not specified';
  const calculatedWeeks = calculateWeeksPregnant(profileData?.monthOfConception);
  const weeksPregnant = calculatedWeeks ?? userPrefs.weeksPregnant ?? 'Not specified';
  const conditions = profileData?.preExistingConditions || userPrefs.preExistingConditions || 'None mentioned';
  const feeling = userPrefs.feeling || 'Not specified';
  const concerns = userPrefs.specificConcerns || 'None mentioned';
  const location = userPrefs.location || 'Not provided';

  // Construct a concise context string for the model
  // This context will be embedded in the initial model response to guide it.
  const systemContext = `
[System Note: You are MomCare AI, an empathetic AI assistant for antenatal care information.
User Context: Name: ${name}, Age: ${age}, Weeks Pregnant: ${weeksPregnant}, Conditions: ${conditions}, Feeling: ${feeling}, Concerns: ${concerns}.
Your Role: Provide supportive, evidence-based *information* only.
**CRITICAL SAFETY RULE:** NEVER give medical diagnoses or specific treatment advice. ALWAYS strongly advise consulting a healthcare professional for medical concerns. Acknowledge user feelings.]
`;

  // Initial history: User's implicit prompt + Model's welcoming response with context & disclaimer
  return [
      {
          role: "user",
          parts: [{ text: `Hi MomCare AI, I'm looking for some pregnancy support. I'm feeling ${feeling}${weeksPregnant !== 'Not specified' ? ` and I'm around ${weeksPregnant} weeks pregnant` : ''}.` }],
      },
      {
          role: "model",
          parts: [{ text: `Hello ${name}! Thanks for reaching out. It's understandable to feel ${feeling}${weeksPregnant !== 'Not specified' ? ` at ${weeksPregnant} weeks` : ''}. I see you mentioned ${conditions !== 'None mentioned' ? `these conditions: ${conditions}` : 'no specific pre-existing conditions'}. \n\n${systemContext}\n\nI'm here to offer general information and support during your pregnancy. Please remember, I cannot provide medical advice – always talk to your doctor or midwife about personal health questions or symptoms. \n\nHow can I assist you today?` }],
      }
  ];
};


// --- Core API Functions ---

/**
* Starts a new chat session with the Gemini model, incorporating user context.
* @param userPrefs User preferences from the pre-chat form
* @param profileData Fetched UserProfile data from Appwrite (can be null)
* @returns The initialized chat session object.
* @throws Error if API key is missing or chat fails to initialize.
*/
export const startChat = async (userPrefs: UserPreferences, profileData: UserProfile | null): Promise<ChatSession> => {
  if (!genAI) {
      throw new Error('Gemini AI client not initialized. Check API Key.');
  }
  try {
      const model = genAI.getGenerativeModel({
          model: MODEL_NAME,
          generationConfig,
          safetySettings,
      });

      const initialHistory = createInitialChatHistory(userPrefs, profileData);

      const chat = model.startChat({
          history: initialHistory,
      });

      console.log("Chat session started successfully.");
      return chat;

  } catch (error) {
      console.error('Error starting chat session:', error);
      if (error instanceof Error && error.message.includes('API key not valid')) {
           throw new Error('Failed to start chat: Invalid API Key.');
      }
      throw new Error('Failed to start chat session. Please check connection/API key.');
  }
};

/**
* Sends a message to an ongoing chat session and gets the full response.
* @param chatSession The active chat session object.
* @param message The user's message string.
* @returns The model's text response string.
* @throws Error if session is invalid, message fails, or response is blocked/empty.
*/
export const sendMessage = async (
  chatSession: ChatSession,
  message: string
): Promise<string> => {
  if (!chatSession) throw new Error("Chat session is not initialized.");

  try {
      console.log(`Sending message: "${message}"`);
      const result = await chatSession.sendMessage(message);
      const response = result.response;

      if (!response) throw new Error("The AI did not provide a response.");

      if (response.promptFeedback?.blockReason) {
          console.warn(`Message blocked due to: ${response.promptFeedback.blockReason}`);
          return `I apologize, but I can't respond to that specific request due to safety guidelines (${response.promptFeedback.blockReason}). Could we perhaps talk about something else related to your pregnancy journey? Remember to consult your doctor for medical advice.`;
      }

      const text = response.text();
      console.log(`Received response: "${text}"`);
      return text;

  } catch (error) {
      console.error('Error sending message:', error);
      if (error instanceof Error && error.message.includes('quota')) {
           throw new Error('Failed to send message: API usage limit reached.');
      }
      throw new Error('Failed to send message. Please try again later.');
  }
};

/**
* Sends a message and streams the response back chunk by chunk.
* @param chatSession The active chat session object.
* @param message The user's message string.
* @param onChunk Callback function executed for each received chunk of text.
* @param onError Callback function executed if an error occurs during streaming.
* @param onComplete Callback function executed when streaming is finished successfully.
*/
export const sendMessageStream = async (
  chatSession: ChatSession,
  message: string,
  onChunk: (chunk: string) => void,
  onError: (error: Error) => void,
  onComplete: () => void
): Promise<void> => {
   if (!chatSession) { onError(new Error("Chat session is not initialized.")); return; }

  try {
      console.log(`Sending message (stream): "${message}"`);
      const result = await chatSession.sendMessageStream(message);

      let blockedMessageSent = false;
      for await (const chunk of result.stream) {
          if (chunk.promptFeedback?.blockReason && !blockedMessageSent) {
              console.warn(`Stream blocked due to: ${chunk.promptFeedback.blockReason}`);
              onChunk(`\n[My response was interrupted due to safety guidelines (${chunk.promptFeedback.blockReason}). Please ask differently. Remember to consult your doctor for medical advice.]`);
              blockedMessageSent = true;
          }
          if (!blockedMessageSent) {
              try {
                  const chunkText = chunk.text(); // This might throw if chunk is empty/invalid
                  onChunk(chunkText);
              } catch (chunkError) {
                  // Handle potential errors getting text from a chunk (less common)
                  console.error("Error processing stream chunk:", chunkError);
                  // Optionally inform the user via onChunk or onError
              }
          }
      }

      // Check final response feedback (might catch issues not in chunks)
      const finalResponse = await result.response;
       if (finalResponse.promptFeedback?.blockReason && !blockedMessageSent) {
          console.warn(`Final response feedback indicates block reason: ${finalResponse.promptFeedback.blockReason}`);
           onChunk(`\n[My response couldn't be fully completed due to safety guidelines (${finalResponse.promptFeedback.blockReason}). Please ask differently or consult your healthcare provider.]`);
      }

      console.log("Message stream completed.");
      onComplete();

  } catch (error) {
      console.error('Error sending message stream:', error);
      let userError = 'Failed to process message stream. Please try again.';
       if (error instanceof Error && error.message.includes('quota')) {
           userError = 'Failed to send message: API usage limit reached.';
       }
      onError(new Error(userError));
  }
};

// --- Medical Document Context (Placeholder / Explanation - Requires Backend) ---
// These functions remain conceptual placeholders as frontend implementation is not feasible/secure.

const extractTextFromMedicalDocument = async (fileId: string, documentType: string | undefined): Promise<string | null> => {
  console.warn(`[Placeholder] extractTextFromMedicalDocument called for ${fileId}. Requires backend implementation.`);
  return null;
};

const getMedicalContextForQuery = async (userId: string, query: string): Promise<string> => {
   console.warn(`[Conceptual] getMedicalContextForQuery called for user ${userId}. Requires backend RAG implementation.`);
   return "";
};

// --- Exports ---
// Exporting default object for easier import
const geminiService = {
  startChat,
  sendMessage,
  sendMessageStream,
};

export default geminiService;

// Export types if they need to be used directly elsewhere
export type { ChatSession };