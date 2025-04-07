import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
    GenerateContentResult,
    BlockReason,
    FinishReason
} from "@google/generative-ai";

// --- Configuration ---
const API_KEY: string | undefined = import.meta.env.VITE_PUBLIC_GEMINI_API_KEY;
const MODEL_NAME: string = "gemini-1.5-flash"; // Use a capable model for formatting tasks

if (!API_KEY) {
    console.error("CRITICAL: VITE_PUBLIC_GEMINI_API_KEY environment variable is not set. Gemini formatting service will be unavailable.");
    // You might want to throw an error here depending on how critical this feature is
    // throw new Error("Gemini API Key is missing. Formatting feature disabled.");
}

// --- Initialization ---
// Initialize the AI client only if the API key is available.
const genAI: GoogleGenerativeAI | null = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// Standard generation configuration for the model.
// Adjust temperature if needed (lower for more predictable formatting, higher for creativity)
const generationConfig = {
    temperature: 0.5, // Slightly lower temperature for more consistent formatting
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 4096, // Allow for potentially longer formatted content
};

// Safety settings (can be adjusted, BLOCK_ONLY_HIGH is generally safe)
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

/**
 * Constructs the prompt for the Gemini API to format text.
 * @param rawText The unformatted text input by the user.
 * @returns The prompt string.
 */
const createFormattingPrompt = (rawText: string): string => {
    return `
You are an expert text formatter specializing in Markdown.
Your task is to take the following raw text and intelligently format it into clean, readable, and well-structured Markdown.

Apply the following formatting rules where appropriate:
- Use Markdown headings (#, ##, ###, etc.) for titles and section breaks. Infer the heading levels from the text structure.
- Ensure proper paragraph separation (a blank line between paragraphs).
- Identify and format bulleted lists using hyphens (-) or asterisks (*).
- Identify and format numbered lists using numbers followed by a period (1., 2., 3.).
- Apply bold (**text**) for emphasis where it seems appropriate (e.g., key terms, subheadings if not using #).
- Apply italics (*text*) for minor emphasis or titles where suitable.
- Preserve code blocks if detected (using \`\`\`language ... \`\`\`).
- Maintain the original meaning and intent of the text.
- Do NOT add any introductory text like "Here is the formatted content:" or explanations.
- Return ONLY the formatted Markdown text.

Raw Text to Format:
---
${rawText}
---

Formatted Markdown Output:
`;
};

/**
 * Sends raw text to the Gemini API and returns intelligently formatted Markdown.
 *
 * @param rawText The plain text content to format.
 * @returns A Promise resolving to the formatted Markdown string.
 * @throws An error if the API key is missing, the API call fails, or the content is blocked.
 */
export const formatContentWithGemini = async (rawText: string): Promise<string> => {
    if (!genAI) {
        throw new Error("Gemini AI client is not initialized. Check API Key.");
    }
    if (!rawText || rawText.trim().length === 0) {
        throw new Error("Input text cannot be empty.");
    }

    try {
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig,
            safetySettings,
        });

        const prompt = createFormattingPrompt(rawText.trim());
        console.log("Sending formatting prompt to Gemini..."); // Optional: for debugging

        const result: GenerateContentResult = await model.generateContent(prompt);
        const response = result.response;

        // --- Response Handling ---
        if (!response) {
            console.error("Gemini Formatting Error: No response object received.");
            throw new Error("The AI formatter did not provide a response.");
        }

        // Check for blocking reasons first
        const blockReason: BlockReason | undefined = response.promptFeedback?.blockReason;
        if (blockReason) {
            console.warn(`Gemini Formatting Blocked: ${blockReason}`);
            throw new Error(`Content formatting was blocked due to safety guidelines (${blockReason}). Please review the content.`);
        }

        // Check for other non-STOP finish reasons
        const finishReason: FinishReason | undefined = response.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== FinishReason.STOP) {
            console.warn(`Gemini Formatting finished due to reason: ${finishReason}`);
            if (finishReason === FinishReason.MAX_TOKENS) {
                // Return the partial text but warn the user
                const partialText = response.text();
                console.warn("Gemini Formatting Warning: Output may be truncated due to maximum token limit.");
                return partialText; // Return what we got
            } else {
                throw new Error(`Formatting stopped unexpectedly (${finishReason}).`);
            }
        }

        // If not blocked and finished with STOP, get the text
        const formattedText = response.text();

        if (!formattedText && (!response.candidates || response.candidates.length === 0)) {
            console.warn("Gemini Formatting Warning: Response received but contains no text content.");
            throw new Error("The AI formatter returned an empty response.");
        }

        console.log("Gemini formatting successful.");
        // Trim any potential leading/trailing whitespace added by the model
        return formattedText.trim();

    } catch (error: unknown) {
        console.error('Error during Gemini formatting:', error);
        if (error instanceof Error) {
            // Refine common errors for better user feedback
            if (error.message.includes('API key not valid')) {
                throw new Error('Gemini Formatting Failed: Invalid API Key.');
            }
            if (error.message.includes('quota')) {
                throw new Error('Gemini Formatting Failed: API quota exceeded.');
            }
            if (error.message.includes('FETCH_ERROR') || error.message.includes('NetworkError')) {
                throw new Error('Gemini Formatting Failed: Network error. Please check connection.');
            }
            // Re-throw specific errors caught above or the original error
            throw error;
        }
        // Throw a generic error for unknown types
        throw new Error('An unexpected error occurred during content formatting.');
    }
};