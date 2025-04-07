// src/pages/ChatPage.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  ClassAttributes,
  AnchorHTMLAttributes,
  useMemo
} from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isAfter, parseISO } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from 'uuid'; // Import uuid for session IDs

// --- UI Imports ---
// Adjust paths as per your project structure
import MainLayout from '@/components/layout/MainLayout';
import ChatHistorySidebar from '@/components/ui/ChatHistorySidebar'; // *** Verify this path is correct ***
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast'; // Adjust path
import {
  Send, Loader2, User, Bot, RefreshCw, Sparkles, Trash2,
  Mic, Bookmark, Share2, ImagePlus, AlertTriangle, X
} from 'lucide-react';

// --- Appwrite Imports ---
// Adjust paths as per your project structure
import {
  getUserProfile, UserProfile, getBloodPressureReadings, getBloodSugarReadings,
  getWeightReadings, getUserAppointments, BloodPressureReading, BloodSugarReading,
  WeightReading, Appointment,
  saveChatMessage, // Requires sessionId now
  getUserChatHistoryForSession, // Use session-specific history fetch
  ChatHistoryMessage,
  addBookmark,
} from '@/lib/appwrite';

// --- Gemini Imports ---
// Adjust paths as per your project structure
import geminiService, {
  ChatSession,
  UserPreferences, AdditionalChatContext,
  fileToGenerativePart,
  Part,
  // Content // Removed from here
} from '@/lib/gemini';
import { Content } from "@google/generative-ai"; // Import Content directly
import { useAuthStore } from '@/store/authStore'; // Adjust path

// --- Helper Functions ---
const parseAppointmentDateTime = (app: Appointment): Date | null => {
    if (!app?.date) return null;
    try {
        // Ensure date is treated as UTC if no time/zone info exists
        const dateString = app.date.includes('T') || app.date.includes('Z') ? app.date : `${app.date}T00:00:00Z`;
        let baseDate = parseISO(dateString);
        if (isNaN(baseDate.getTime())) { return null; }

        // Try parsing time if available
        if (app.time) {
            const timeMatch = app.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (timeMatch) {
                let hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                const period = timeMatch[3]?.toUpperCase();

                if (!isNaN(hours) && !isNaN(minutes) && minutes >= 0 && minutes <= 59) {
                    if (period) { // Handle AM/PM
                        if (hours >= 1 && hours <= 12) {
                            if (period === 'PM' && hours !== 12) hours += 12;
                            if (period === 'AM' && hours === 12) hours = 0; // Midnight case
                        } else { hours = NaN; } // Invalid hour for AM/PM
                    } else { // Handle 24-hour format
                        if (hours < 0 || hours > 23) hours = NaN;
                    }

                    if (!isNaN(hours)) {
                        // Combine date parts with parsed time parts in UTC
                        const combinedDate = new Date(Date.UTC(
                            baseDate.getUTCFullYear(),
                            baseDate.getUTCMonth(),
                            baseDate.getUTCDate(),
                            hours,
                            minutes
                        ));
                        if (!isNaN(combinedDate.getTime())) {
                            return combinedDate;
                        }
                    }
                }
            }
        }
        // If time parsing fails or no time provided, return the base date (start of day UTC)
        return baseDate;
    } catch (error) {
        console.error('Error parsing appt date/time:', app.date, app.time, error);
        return null;
    }
};

const extractCommonConcerns = (chatHistory: ChatHistoryMessage[]): string[] => {
    if (!chatHistory) return [];
    // Extract content from the last few USER messages
    return chatHistory
        .filter(msg => msg.role === 'user' && msg.content?.trim())
        .slice(-3) // Take last 3 user messages
        .map(msg => msg.content);
};

const calculateTrimester = (weeks: number | undefined | null): 1 | 2 | 3 | null => {
    if (weeks === undefined || weeks === null || weeks < 0 || isNaN(weeks)) return null;
    if (weeks <= 13) return 1;
    if (weeks <= 27) return 2;
    if (weeks <= 45) return 3; // Allow up to 45 for buffer
    return null; // Weeks out of typical range
};

// --- Type Definitions ---

// Type for custom anchor component props used in ReactMarkdown
type AnchorProps = ClassAttributes<HTMLAnchorElement> & AnchorHTMLAttributes<HTMLAnchorElement> & { node?: any };

// --- Manual Type Definitions for Web Speech API ---
declare global {
    interface Window {
        SpeechRecognition: typeof SpeechRecognition;
        webkitSpeechRecognition: typeof SpeechRecognition;
    }
    interface SpeechRecognitionEventMap { "audiostart": Event; "audioend": Event; "end": Event; "error": SpeechRecognitionErrorEvent; "nomatch": SpeechRecognitionEvent; "result": SpeechRecognitionEvent; "soundstart": Event; "soundend": Event; "speechstart": Event; "speechend": Event; "start": Event; }
    interface SpeechRecognition extends EventTarget { grammars: SpeechGrammarList; lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; serviceURI: string; start(): void; stop(): void; abort(): void; onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null; onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null; onend: ((this: SpeechRecognition, ev: Event) => any) | null; onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null; onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null; onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null; onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null; onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null; onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null; onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null; onstart: ((this: SpeechRecognition, ev: Event) => any) | null; addEventListener<K extends keyof SpeechRecognitionEventMap>(type: K, listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void; addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void; removeEventListener<K extends keyof SpeechRecognitionEventMap>(type: K, listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any, options?: boolean | EventListenerOptions): void; removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void; }
    var SpeechRecognition: { prototype: SpeechRecognition; new(): SpeechRecognition; };
    interface SpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: SpeechRecognitionResultList; }
    var SpeechRecognitionEvent: { prototype: SpeechRecognitionEvent; new(type: string, eventInitDict: SpeechRecognitionEventInit): SpeechRecognitionEvent; };
    interface SpeechRecognitionEventInit extends EventInit { resultIndex?: number; results?: SpeechRecognitionResultList; }
    interface SpeechRecognitionErrorEvent extends Event { readonly error: SpeechRecognitionErrorCode; readonly message: string; }
     var SpeechRecognitionErrorEvent: { prototype: SpeechRecognitionErrorEvent; new(type: string, eventInitDict: SpeechRecognitionErrorEventInit): SpeechRecognitionErrorEvent; };
    interface SpeechRecognitionErrorEventInit extends EventInit { error: SpeechRecognitionErrorCode; message?: string; }
    type SpeechRecognitionErrorCode = | "no-speech" | "aborted" | "audio-capture" | "network" | "not-allowed" | "service-not-allowed" | "bad-grammar" | "language-not-supported";
    interface SpeechGrammar { src: string; weight: number; }
     var SpeechGrammar: { prototype: SpeechGrammar; new(): SpeechGrammar; };
    interface SpeechGrammarList { readonly length: number; item(index: number): SpeechGrammar; [index: number]: SpeechGrammar; addFromURI(src: string, weight?: number): void; addFromString(string: string, weight?: number): void; }
     var SpeechGrammarList: { prototype: SpeechGrammarList; new(): SpeechGrammarList; };
    interface SpeechRecognitionResult { readonly length: number; item(index: number): SpeechRecognitionAlternative; [index: number]: SpeechRecognitionAlternative; readonly isFinal: boolean; }
    interface SpeechRecognitionResultList { readonly length: number; item(index: number): SpeechRecognitionResult; [index: number]: SpeechRecognitionResult; }
    interface SpeechRecognitionAlternative { readonly transcript: string; readonly confidence: number; }
}
// --- End of Manual Type Definitions ---


// --- Chat Message Structure for UI ---
export interface ChatMessagePart {
    type: 'text' | 'image';
    content: string; // For text: markdown string; For image: object URL/preview URL
    alt?: string; // Alt text for images
}

export interface ChatUIMessage {
    role: 'user' | 'model';
    parts: ChatMessagePart[];
}


// --- Component ---
const ChatPage: React.FC = () => {
  // --- Component State ---
  const [showPreChat, setShowPreChat] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false); // General loading (sending msg, loading session)
  const [isStartingChat, setIsStartingChat] = useState<boolean>(false); // Specifically for starting NEW chat
  const [isContextLoading, setIsContextLoading] = useState<boolean>(true); // Loading initial profile/data
  const [chatSession, setChatSession] = useState<ChatSession | null>(null); // Gemini chat object
  const [messages, setMessages] = useState<ChatUIMessage[]>([]); // UI messages
  const [inputMessage, setInputMessage] = useState<string>('');
  const [streamingResponse, setStreamingResponse] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null); // Active session ID
  const [feeling, setFeeling] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [weeksPregnant, setWeeksPregnant] = useState<string>('');
  const [preExistingConditions, setPreExistingConditions] = useState<string>('');
  const [specificConcerns, setSpecificConcerns] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [latestBp, setLatestBp] = useState<BloodPressureReading | null>(null);
  const [latestSugar, setLatestSugar] = useState<BloodSugarReading | null>(null);
  const [latestWeight, setLatestWeight] = useState<WeightReading | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<(Appointment & { dateTime?: Date | null })[]>([]);
  const [pregnancyTrimester, setPregnancyTrimester] = useState<1 | 2 | 3 | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [showPdfConfirm, setShowPdfConfirm] = useState<boolean>(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const [chatStartWeeksPregnant, setChatStartWeeksPregnant] = useState<number | undefined>(undefined);


  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // --- Fetch Initial Context (Profile, Vitals, Appointments - NOT Chat History) ---
  const fetchInitialContext = useCallback(async () => {
    if (!user?.$id) { setIsContextLoading(false); setShowPreChat(true); return; }
    setIsContextLoading(true); setError(null); setUserProfile(null); setLatestBp(null); setLatestSugar(null); setLatestWeight(null); setUpcomingAppointments([]); setAge(''); setPreExistingConditions(''); setPregnancyTrimester(null);
    try {
        // Fetch profile, vitals, appointments - history is loaded per-session now
        const results = await Promise.allSettled([
            getUserProfile(user.$id),
            getBloodPressureReadings(user.$id, 1),
            getBloodSugarReadings(user.$id, 1),
            getWeightReadings(user.$id, 1),
            getUserAppointments(user.$id)
        ]);
        // Handle profile result
        const profileResult = results[0];
        if (profileResult.status === 'fulfilled' && profileResult.value) {
            const d = profileResult.value; setUserProfile(d);
            if (d.age) setAge(d.age.toString());
            if (d.preExistingConditions) setPreExistingConditions(d.preExistingConditions);
            setPregnancyTrimester(calculateTrimester(d.weeksPregnant));
        } else if (profileResult.status === 'rejected') { console.error("Profile Error:", profileResult.reason); toast({ title: "Profile Error", variant: "destructive" }); }
        // Handle BP result
        const bpResult = results[1]; if (bpResult.status === 'fulfilled' && bpResult.value.length > 0) setLatestBp(bpResult.value[0]); else if (bpResult.status === 'rejected') console.error("BP Error:", bpResult.reason);
        // Handle Sugar result
        const sugarResult = results[2]; if (sugarResult.status === 'fulfilled' && sugarResult.value.length > 0) setLatestSugar(sugarResult.value[0]); else if (sugarResult.status === 'rejected') console.error("Sugar Error:", sugarResult.reason);
        // Handle Weight result
        const weightResult = results[3]; if (weightResult.status === 'fulfilled' && weightResult.value.length > 0) setLatestWeight(weightResult.value[0]); else if (weightResult.status === 'rejected') console.error("Weight Error:", weightResult.reason);
        // Handle Appointments result
        const appointmentsResult = results[4];
        if (appointmentsResult.status === 'fulfilled') {
            const all = appointmentsResult.value || []; const now = new Date();
            const future = all.map(app => ({ ...app, dateTime: parseAppointmentDateTime(app) }))
                             .filter((app): app is Appointment & { dateTime: Date } => !!app.dateTime && isAfter(app.dateTime, now) && !app.isCompleted)
                             .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
            setUpcomingAppointments(future.slice(0, 3));
        } else console.error("Appt Error:", appointmentsResult.reason);

    } catch (err) {
        console.error("Context Fetch Error:", err);
        toast({ title: "Context Error", description: "Failed to load initial user data.", variant: "destructive" });
        setError("Failed to load data.");
        setUserProfile(null); setLatestBp(null); setLatestSugar(null); setLatestWeight(null); setUpcomingAppointments([]);
    } finally {
        setIsContextLoading(false);
    }
  }, [user?.$id, toast]);

  // --- Effects ---
  useEffect(() => { fetchInitialContext(); }, [fetchInitialContext]); // Fetch context on mount/user change
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingResponse]); // Scroll on new messages

  // Effect to create/revoke object URL for image preview
  useEffect(() => {
    let objectUrl: string | null = null;
    if (pendingImageFile) {
      objectUrl = URL.createObjectURL(pendingImageFile);
      setPendingImagePreviewUrl(objectUrl);
    } else {
      setPendingImagePreviewUrl(null);
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [pendingImageFile]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.stop(); };
  }, []);


  // --- Format Appwrite History to Gemini History ---
  const formatHistoryForGemini = (history: ChatHistoryMessage[]): Content[] => {
    return history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }] // Assumes text-only from DB for Gemini context
    }));
  };

  // --- Format Appwrite History to UI Messages ---
  const formatHistoryForUI = (history: ChatHistoryMessage[]): ChatUIMessage[] => {
      return history.map(msg => ({
          role: msg.role,
          // Simple conversion assuming text only from DB
          // If DB stored structured parts, logic would be more complex
          parts: [{ type: 'text', content: msg.content }]
      }));
  };


  // --- Start NEW Chat Handler ---
  const handleStartChat = useCallback(async () => {
    // Validation
    if (!feeling) { toast({ title: "Select feeling", variant: "destructive" }); return; }
    const ageNum = Number(age); if (!age || isNaN(ageNum) || ageNum <= 10 || ageNum > 120) { toast({ title: "Valid age required", variant: "destructive" }); return; }
    const formWeeksNum = weeksPregnant ? parseInt(weeksPregnant, 10) : undefined; if (weeksPregnant && (isNaN(formWeeksNum) || formWeeksNum < 0 || formWeeksNum > 45)) { toast({ title: "Valid weeks (0-45)", variant: "destructive" }); return; }
    if (!user?.$id) { toast({ title: "Auth Error", variant: "destructive" }); navigate('/login'); return; }

    setIsStartingChat(true); setError(null); setMessages([]); // Clear previous messages
    const newSessionId = uuidv4(); // Generate a unique ID for the new session
    setCurrentSessionId(newSessionId); // Set the new session ID as active

    const effectiveWeeks = formWeeksNum ?? userProfile?.weeksPregnant;
    setChatStartWeeksPregnant(effectiveWeeks);
    const sessionTrimester = calculateTrimester(effectiveWeeks);
    setPregnancyTrimester(sessionTrimester);

    try {
        const userPrefs: UserPreferences = {
            feeling, age: ageNum, weeksPregnant: effectiveWeeks,
            preExistingConditions: preExistingConditions || undefined,
            specificConcerns: specificConcerns || undefined,
        };

        // Fetch recent concerns *just before* starting the new chat for context priming
        let recentConcerns: string[] = [];
        try {
             // Fetch last 5 overall messages to extract recent topics
             const recentHistory = await getUserChatHistoryForSession(user.$id, '', 5); // Empty session ID fetches overall recent
             recentConcerns = extractCommonConcerns(recentHistory);
        } catch (histErr) {
            console.warn("Could not fetch recent concerns for new chat context:", histErr);
        }

        const additionalContext: AdditionalChatContext = {
            latestBp: latestBp as any, latestSugar: latestSugar as any, latestWeight: latestWeight as any,
            upcomingAppointments: upcomingAppointments as any,
            previousConcerns: recentConcerns // Use freshly fetched concerns
        };

        // Start Gemini chat (gemini.ts handles initial prompt/history)
        const chat = await geminiService.startChat(userPrefs, userProfile as any, additionalContext);
        setChatSession(chat);

        // Get the initial messages *from Gemini's perspective* (includes the AI's first message)
        const initialHistoryFromGemini = await chat.getHistory();
        const formattedInitialMessages: ChatUIMessage[] = initialHistoryFromGemini
            .filter(h => h.role === 'user' || h.role === 'model')
            .map(h => ({
                role: h.role as 'user' | 'model',
                parts: h.parts.map(p => ({ type: 'text', content: p.text ?? '' })) // Assuming text only initially
            }));

        setMessages(formattedInitialMessages); // Display initial messages
        setShowPreChat(false); // Hide pre-chat form

        // Save initial messages to Appwrite history *with the new session ID*
        for (const msg of formattedInitialMessages) {
            // Ensure content exists before saving
            const contentToSave = msg.parts.find(p => p.type === 'text')?.content?.trim();
            if ((msg.role === 'user' || msg.role === 'model') && contentToSave) {
                try {
                    await saveChatMessage(user.$id, msg.role, contentToSave, newSessionId);
                } catch (saveError) {
                    console.error(`Failed to save initial ${msg.role} msg for session ${newSessionId}:`, saveError);
                    toast({ title: "History Warning", description: `Could not save initial ${msg.role} message.`, variant: "destructive" });
                }
            }
        }
    } catch (error) {
        console.error('Error starting chat:', error);
        const msg = error instanceof Error ? error.message : "Unknown error.";
        setError(`Start chat failed: ${msg}`);
        toast({ title: "Start Chat Failed", description: msg, variant: "destructive" });
        setCurrentSessionId(null); // Reset session ID on failure
        setPregnancyTrimester(null); setChatStartWeeksPregnant(undefined);
        setShowPreChat(true); // Go back to pre-chat on failure
    } finally {
        setIsStartingChat(false);
    }
  }, [ feeling, age, weeksPregnant, user?.$id, userProfile, preExistingConditions, specificConcerns, latestBp, latestSugar, latestWeight, upcomingAppointments, toast, navigate ]);


  // --- Send Message Handler ---
  const handleSendMessage = useCallback(async (messageToSendOverride?: string) => {
    const messageText = (messageToSendOverride || inputMessage).trim();

    if (!messageText && !pendingImageFile) {
        toast({ title: "Cannot Send", description: "Please type a message or attach an image.", variant: "default" });
        return;
    }
    // Ensure we have an active session ID
    if (!chatSession || isLoading || !user?.$id || !currentSessionId) {
        if (!currentSessionId) setError("No active chat session. Please start or load a chat.");
        if (!chatSession) setError("Chat session lost. Please restart or load a session.");
        if (isLoading) console.warn("Attempted to send message while already loading.");
        return;
    }

    if (isRecording && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
    }

    setIsLoading(true); setError(null); setStreamingResponse('');

    const uiMessageParts: ChatMessagePart[] = [];
    const apiContentToSend: (string | Part)[] = [];

    // Process Pending Image
    if (pendingImageFile && pendingImagePreviewUrl) {
        try {
            uiMessageParts.push({ type: 'image', content: pendingImagePreviewUrl, alt: pendingImageFile.name });
            const imageApiPart = await fileToGenerativePart(pendingImageFile);
            apiContentToSend.push(imageApiPart);
        } catch (err) {
            console.error("ChatPage: Error processing image file:", err);
            toast({ title: "Image Error", description: err instanceof Error ? err.message : 'Could not process image', variant: "destructive" });
            setIsLoading(false); setPendingImageFile(null); return;
        }
    }

    // Process Text Message
    if (messageText) {
        uiMessageParts.push({ type: 'text', content: messageText });
        apiContentToSend.push(messageText);
    }

    // Update UI Immediately
    const userMessage: ChatUIMessage = { role: 'user', parts: uiMessageParts };
    setMessages(prev => [...prev, userMessage]);

    // Create Text Representation for History DB
    const historyText = uiMessageParts.map(part =>
        part.type === 'image' ? `[Image: ${part.alt || 'attached'}]` : part.content
    ).join('\n').trim();

    // Clear inputs *after* processing
    if (!messageToSendOverride) setInputMessage('');
    setPendingImageFile(null);

    // Save User Message to Appwrite History *with currentSessionId*
    if (historyText) {
        try {
            await saveChatMessage(user.$id, 'user', historyText, currentSessionId);
        } catch (saveError) {
            console.error("ChatPage: Failed to save user message to history:", saveError);
            toast({ title: "History Warning", description: "Could not save your message to history.", variant: "destructive" });
        }
    }

    // Call Gemini API with Streaming
    let accumulatedResponse = "";
    let finalModelMessageSaved = false;

    try {
        await geminiService.sendMessageStream(
            chatSession, apiContentToSend,
            (chunk) => { // onChunk
                accumulatedResponse += chunk;
                setStreamingResponse(accumulatedResponse);
            },
            (streamError) => { // onError
                console.error('ChatPage: Streaming Error:', streamError);
                const errorMsg = streamError.message || "An unknown streaming error occurred.";
                setError(`Error receiving response: ${errorMsg}`);
                toast({ title: "Response Error", description: errorMsg, variant: "destructive" });
                setIsLoading(false); setStreamingResponse('');
                setMessages(prev => [...prev, { role: 'model', parts: [{ type: 'text', content: `[Sorry, an error occurred: ${errorMsg}]` }] }]);
            },
            async () => { // onComplete
                setIsLoading(false);
                setStreamingResponse('');

                if (accumulatedResponse.trim() && !finalModelMessageSaved) {
                    setMessages(prev => [...prev, { role: 'model', parts: [{ type: 'text', content: accumulatedResponse }] }]);

                    // Save final model message to Appwrite history *with currentSessionId*
                    try {
                        await saveChatMessage(user.$id, 'model', accumulatedResponse, currentSessionId);
                        finalModelMessageSaved = true;
                    } catch (saveError) {
                        console.error("ChatPage: Failed to save final model message to history:", saveError);
                        toast({ title: "History Warning", description: "Could not save AI response to history.", variant: "destructive" });
                    }
                } else if (!accumulatedResponse.trim()) {
                    // Handle cases where the stream completed but produced no text
                    console.warn("ChatPage: Stream completed with no accumulated text.");
                    const wasImageSent = apiContentToSend.some(part => typeof part !== 'string');
                    if (wasImageSent) {
                         setMessages(prev => [...prev, { role: 'model', parts: [{ type: 'text', content: "[Image acknowledged.]" }] }]);
                         // Optionally save this acknowledgement to history
                         try { await saveChatMessage(user.$id, 'model', "[Image acknowledged.]", currentSessionId); } catch (e) {}
                    }
                }
            }
        );
    } catch (error) { // Catch errors from *initiating* the stream
        console.error('ChatPage: Error initiating sendMessageStream:', error);
        const errorMsg = error instanceof Error ? error.message : "An unknown error occurred.";
        setError(`Failed to send message: ${errorMsg}`);
        toast({ title: "Send Error", description: errorMsg, variant: "destructive" });
        setIsLoading(false); setStreamingResponse('');
        setMessages(prev => [...prev, { role: 'model', parts: [{ type: 'text', content: `[Sorry, failed to send message: ${errorMsg}]` }] }]);
    }
  }, [ chatSession, inputMessage, isLoading, user?.$id, toast, pendingImageFile, pendingImagePreviewUrl, isRecording, currentSessionId ]);


  // --- Load Chat Session Handler ---
  const handleLoadSession = useCallback(async (sessionId: string) => {
    if (!user?.$id || isLoading || isStartingChat) return;
    if (sessionId === currentSessionId) return; // Don't reload the current session

    console.log(`Loading session: ${sessionId}`);
    setIsLoading(true); // Use general loading state
    setError(null);
    setMessages([]); // Clear current messages
    setChatSession(null); // Clear current Gemini session
    setCurrentSessionId(sessionId); // Set the new session ID
    setShowPreChat(false); // Ensure chat view is shown
    setInputMessage(''); // Clear any pending input
    setPendingImageFile(null); // Clear any pending image

    try {
        // 1. Fetch history for the selected session from Appwrite
        const history = await getUserChatHistoryForSession(user.$id, sessionId, 500); // Fetch more messages if needed
        if (history.length === 0) {
            toast({ title: "Empty Session", description: "This chat session appears to be empty.", variant: "default" });
            // Keep the session ID, but show empty state. User can type or restart.
            setIsLoading(false);
            // Create a minimal Gemini session anyway so user can start typing
            const minimalPrefs: UserPreferences = { age: userProfile?.age, weeksPregnant: userProfile?.weeksPregnant };
            const minimalContext: AdditionalChatContext = { latestBp: null, latestSugar: null, latestWeight: null, upcomingAppointments: [], previousConcerns: [] };
            const chat = await geminiService.startChat(minimalPrefs, userProfile as any, minimalContext);
            setChatSession(chat);
            return;
        }

        // 2. Format history for UI display
        const uiMessages = formatHistoryForUI(history);
        setMessages(uiMessages);

        // 3. Re-initialize Gemini ChatSession with the loaded history's context
        //    Use current profile data but extract concerns from the *loaded* history
        const currentWeeks = userProfile?.weeksPregnant;
        const currentConditions = userProfile?.preExistingConditions;
        const currentAge = userProfile?.age;

        let recentConcernsFromHistory: string[] = [];
        try {
             recentConcernsFromHistory = extractCommonConcerns(history); // Get concerns from loaded history
        } catch (histErr) { console.warn("Could not extract recent concerns from loaded history:", histErr); }

        const userPrefsForLoad: UserPreferences = { age: currentAge, weeksPregnant: currentWeeks, preExistingConditions: currentConditions };
        const additionalContextForLoad: AdditionalChatContext = {
            latestBp: latestBp as any, latestSugar: latestSugar as any, latestWeight: latestWeight as any,
            upcomingAppointments: upcomingAppointments as any,
            previousConcerns: recentConcernsFromHistory // Use concerns from the specific history
        };

        // Re-create the Gemini chat object using the current context
        // Limitation: This doesn't perfectly replay the *exact* context from the time the session started.
        const chat = await geminiService.startChat(userPrefsForLoad, userProfile as any, additionalContextForLoad);

        // NOTE: The Gemini session starts with its own initial messages based on the context provided.
        // It does NOT automatically load the `history` array into its internal state for continuation.
        // The next message sent will use the context, but the AI won't "remember" the specific turns
        // from the loaded `history` unless the Gemini library offers a specific "resume" mechanism
        // or allows passing history directly into startChat/sendMessage in a way that sets the conversation state.
        // We accept this limitation for now. The UI shows the history correctly.

        setChatSession(chat); // Set the re-initialized chat session

        // Determine weeks pregnant at the start of the loaded session if possible (best effort)
        const firstUserMessage = history.find(m => m.role === 'user');
        const weeksMatch = firstUserMessage?.content.match(/(\d+)\s+weeks/i);
        const loadedSessionStartWeeks = weeksMatch ? parseInt(weeksMatch[1], 10) : userProfile?.weeksPregnant;
        setChatStartWeeksPregnant(loadedSessionStartWeeks);
        setPregnancyTrimester(calculateTrimester(loadedSessionStartWeeks));


        toast({ title: "Session Loaded", description: `Loaded chat session.` });

    } catch (error) {
        console.error(`Error loading session ${sessionId}:`, error);
        const msg = error instanceof Error ? error.message : "Unknown error.";
        setError(`Failed to load session: ${msg}`);
        toast({ title: "Load Failed", description: msg, variant: "destructive" });
        setCurrentSessionId(null); // Reset session ID on failure
        setChatSession(null);
        setShowPreChat(true); // Go back to pre-chat on load failure
    } finally {
        setIsLoading(false);
    }

  }, [user?.$id, isLoading, isStartingChat, currentSessionId, toast, userProfile, latestBp, latestSugar, latestWeight, upcomingAppointments]);
// --- NEW: Handle Session Deletion from Sidebar ---
const handleSessionDeleted = useCallback((deletedSessionId: string) => {
  toast({
      title: "Session Deleted",
      description: "The chat history for the session was removed.",
  });
  // If the currently viewed session was deleted, reset the view
  if (deletedSessionId === currentSessionId) {
      console.log("Current session deleted, resetting view.");
      setMessages([]);
      setStreamingResponse('');
      setError(null);
      setChatSession(null);
      setCurrentSessionId(null);
      setPendingImageFile(null);
      setInputMessage('');
      setChatStartWeeksPregnant(undefined);
      setPregnancyTrimester(calculateTrimester(userProfile?.weeksPregnant)); // Reset based on profile
      setShowPreChat(true); // Go back to the pre-chat form
  }
}, [currentSessionId, toast, userProfile]); // Added userProfile dependency

  // --- Other Handlers ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isLoading && currentSessionId) { // Check currentSessionId
          e.preventDefault();
          handleSendMessage();
      }
  }, [isLoading, handleSendMessage, currentSessionId]); // Added currentSessionId

  const handleClearChat = useCallback(() => {
      // Clears the current view, does not delete history
      if (isLoading) return;
      setMessages([]);
      setStreamingResponse('');
      setError(null);
      setPendingImageFile(null);
      setInputMessage('');
      // Keep currentSessionId, user is just clearing the screen for the active session
      toast({ title: "Chat View Cleared" });
  }, [isLoading, toast]);

  const handleRestartChat = useCallback(() => { // Acts as "New Chat"
      if (isLoading || isStartingChat || isContextLoading) return;
      setMessages([]);
      setStreamingResponse('');
      setError(null);
      setChatSession(null);
      setCurrentSessionId(null); // Clear session ID for new chat
      setFeeling(''); // Reset pre-chat form fields
      setWeeksPregnant('');
      setSpecificConcerns('');
      // Keep age and preExistingConditions from profile if available
      setAge(userProfile?.age?.toString() ?? '');
      setPreExistingConditions(userProfile?.preExistingConditions ?? '');
      setPendingImageFile(null);
      setChatStartWeeksPregnant(undefined);
      setPregnancyTrimester(calculateTrimester(userProfile?.weeksPregnant)); // Reset based on profile
      if (isRecording && recognitionRef.current) { recognitionRef.current.stop(); setIsRecording(false); }
      setShowPreChat(true); // Go back to the pre-chat form
      // No need to refetch context unless profile might have changed externally
      toast({ title: "Ready for New Chat" });
  }, [isLoading, isStartingChat, isContextLoading, toast, isRecording, userProfile]); // Added userProfile dependency

  // Updated handleVoiceInput using manually defined types
  const handleVoiceInput = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { toast({ title: "Voice Input Not Supported", variant: "destructive" }); return; }
    if (isRecording && recognitionRef.current) { recognitionRef.current.stop(); return; } // Stop logic handled by onend
    if (!isRecording) {
        try {
            const recognition = new SpeechRecognitionAPI();
            recognitionRef.current = recognition;
            recognition.lang = 'en-US'; // Or configure based on user preference
            recognition.interimResults = false; // We only want final results
            recognition.maxAlternatives = 1;

            recognition.onstart = () => setIsRecording(true);
            recognition.onend = () => { setIsRecording(false); recognitionRef.current = null; }; // Cleanup ref on end
            recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error("Speech Recognition Error:", event.error, event.message);
                let userMessage = `Voice input error: ${event.error}.`;
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') userMessage = "Microphone permission denied. Please allow access in browser settings.";
                else if (event.error === 'no-speech') userMessage = "Didn't hear anything. Please try speaking again.";
                else if (event.error === 'audio-capture') userMessage = "Microphone problem. Check connection/settings.";
                // Only show toast for actual errors, not manual aborts
                if (event.error !== 'aborted') {
                    toast({ title: "Voice Error", description: userMessage, variant: "destructive" });
                }
                // Ensure state is reset even on error
                setIsRecording(false);
                recognitionRef.current = null;
            };
            recognition.onresult = (event: SpeechRecognitionEvent) => {
                const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
                if (transcript) {
                    setInputMessage(prev => prev ? `${prev.trim()} ${transcript}` : transcript);
                } else {
                    toast({ title: "Voice Input", description: "Didn't catch that. Please try again.", variant: "default" });
                }
            };
            recognition.start(); // Start listening
        } catch (err) {
            console.error("Error starting speech recognition instance:", err);
            toast({ title: "Voice Error", description: "Could not initialize voice input. Check browser compatibility/permissions.", variant: "destructive" });
            setIsRecording(false);
            recognitionRef.current = null;
        }
    }
  }, [isRecording, toast, setInputMessage]); // Dependencies

  const handleBookmarkClick = useCallback(async (messageContent: string) => {
    if (!user?.$id) { toast({ title: "Login Required", variant: "destructive" }); return; }
    const trimmedContent = messageContent?.trim();
    if (!trimmedContent) { toast({ title: "Cannot Bookmark Empty", variant: "default" }); return; }
    try {
        await addBookmark(user.$id, { messageContent: trimmedContent });
        toast({ title: "Bookmarked Successfully" });
    } catch (error) {
        console.error("Bookmark Failed:", error);
        toast({ title: "Bookmark Failed", description: error instanceof Error ? error.message : "Could not save bookmark.", variant: "destructive" });
    }
  }, [user?.$id, toast]);

  // Trigger hidden file input
  const handleImageAttachClick = useCallback(() => {
      if (isLoading || !currentSessionId) { toast({ title: "Please wait or start a chat", variant: "default"}); return; }
      if (pendingImageFile) { toast({ title: "Image Already Attached", description: "Remove the current image first.", variant: "default"}); return; }
      imageInputRef.current?.click();
  }, [isLoading, pendingImageFile, toast, currentSessionId]); // Added currentSessionId

  // Handle file selection from input
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    if (!allowedTypes.includes(file.type)) { toast({ title: "Invalid File Type", description: "Please select JPG, PNG, WEBP, GIF, HEIC, or HEIF.", variant: "destructive" }); if (imageInputRef.current) imageInputRef.current.value = ""; return; }
    const maxSizeMB = 4;
    if (file.size > maxSizeMB * 1024 * 1024) { toast({ title: "File Too Large", description: `Max size ${maxSizeMB}MB.`, variant: "destructive" }); if (imageInputRef.current) imageInputRef.current.value = ""; return; }
    setPendingImageFile(file);
    toast({ title: "Image Ready", description: `Selected: ${file.name}` });
    if (imageInputRef.current) imageInputRef.current.value = ""; // Clear input value
  }, [toast]);

  // Remove the pending image
  const handleRemovePendingImage = useCallback(() => { setPendingImageFile(null); }, []);


  // --- PDF Export Handler ---
  const handleExportPDF = useCallback(async () => {
    if (messages.length === 0) { toast({ title: "Cannot Export Empty Chat", variant: "destructive" }); return; }
    setShowPdfConfirm(false); setIsExportingPdf(true); toast({ title: "Generating PDF..." });
    await new Promise(resolve => setTimeout(resolve, 100)); // Allow toast render

    try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const pageHeight = doc.internal.pageSize.getHeight(); const pageWidth = doc.internal.pageSize.getWidth(); const margin = 40; const usableWidth = pageWidth - 2 * margin; const lineHeightFactor = 1.3; const spaceAfterMessage = 12; const spaceAfterHeader = 25; const spaceAfterInfoLine = 5;
        const userColor = '#4F46E5'; const modelColor = '#10B981'; const textColor = '#1F2937'; const metaColor = '#6B7280'; const headerColor = '#374151';
        const titleFontSize = 16; const infoFontSize = 9; const regularFontSize = 10; const prefixFontSize = 9;
        let currentY = margin; let pageNumber = 1;

        const addHeaderFooter = (currentPage: number) => {
            let headerY = margin;
            // Header
            doc.setFont('helvetica', 'bold'); doc.setFontSize(titleFontSize); doc.setTextColor(headerColor); doc.text('MomCare AI Chat Transcript', pageWidth / 2, headerY, { align: 'center' }); headerY += titleFontSize + spaceAfterInfoLine * 2;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(infoFontSize); doc.setTextColor(metaColor);
            const patientName = userProfile?.name ?? 'N/A'; const patientAge = userProfile?.age ?? 'N/A'; const patientGender = userProfile?.gender ?? 'N/A';
            // Use chatStartWeeksPregnant for consistency if available for this session
            const weeksText = chatStartWeeksPregnant !== undefined ? `${chatStartWeeksPregnant} wks` : (userProfile?.weeksPregnant !== undefined ? `${userProfile.weeksPregnant} wks` : 'N/A');
            const sessionIdText = currentSessionId ? `...${currentSessionId.slice(-8)}` : 'N/A';
            doc.text(`Patient: ${patientName}`, margin, headerY); doc.text(`Age: ${patientAge}`, margin + usableWidth / 3, headerY); doc.text(`Session ID: ${sessionIdText}`, margin + 2*usableWidth / 3, headerY); headerY += infoFontSize + spaceAfterInfoLine;
            doc.text(`Gender: ${patientGender}`, margin, headerY); doc.text(`Weeks Pregnant (Est. Start): ${weeksText}`, margin + usableWidth / 3, headerY); headerY += infoFontSize + spaceAfterInfoLine * 2;
            doc.text(`Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`, margin, headerY); headerY += infoFontSize + spaceAfterInfoLine;
            // Line separator
            doc.setDrawColor(metaColor); doc.setLineWidth(0.5); doc.line(margin, headerY, pageWidth - margin, headerY); headerY += spaceAfterHeader;
            // Footer (Page Number)
            doc.setFontSize(infoFontSize); doc.setTextColor(metaColor); doc.text(`Page ${currentPage}`, pageWidth - margin, pageHeight - margin / 2, { align: 'right' });
            return headerY; // Return the starting Y position for content
        };
        currentY = addHeaderFooter(pageNumber);

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i]; const isUser = message.role === 'user'; const prefix = isUser ? "You:" : "AI:"; const prefixColor = isUser ? userColor : modelColor; const alignment = isUser ? 'right' : 'left'; const indent = isUser ? 50 : 0; const availableWidth = usableWidth - indent;

            // Calculate Message Height
            let messageContentHeight = 0;
            message.parts.forEach(part => {
                const text = part.type === 'text' ? (part.content || "[Empty]") : `[Image: ${part.alt || 'attached'}]`;
                const lines = doc.splitTextToSize(text, availableWidth);
                messageContentHeight += lines.length * regularFontSize * lineHeightFactor + spaceAfterInfoLine; // Add space between parts
            });
            const prefixHeight = prefixFontSize * lineHeightFactor;
            const totalMessageHeight = prefixHeight + spaceAfterInfoLine + messageContentHeight;

            // Check for Page Break
            if (currentY + totalMessageHeight > pageHeight - margin - (infoFontSize + spaceAfterInfoLine)) { // Check against bottom margin + footer height
                pageNumber++; doc.addPage(); currentY = addHeaderFooter(pageNumber);
            }

            // Draw Prefix
            doc.setFontSize(prefixFontSize); doc.setFont('helvetica', 'bold'); doc.setTextColor(prefixColor); const prefixX = isUser ? pageWidth - margin : margin; doc.text(prefix, prefixX, currentY, { align: alignment }); currentY += prefixHeight + spaceAfterInfoLine;

            // Draw Message Parts
            doc.setFontSize(regularFontSize); doc.setFont('helvetica', 'normal');
            for (const part of message.parts) {
                const partX = isUser ? pageWidth - margin : margin; const partColor = isUser ? userColor : textColor; doc.setTextColor(partColor);
                if (part.type === 'text') {
                    const lines = doc.splitTextToSize(part.content || "[Empty]", availableWidth); const textPartHeight = lines.length * regularFontSize * lineHeightFactor;
                    doc.text(lines, partX, currentY, { align: alignment, maxWidth: availableWidth }); currentY += textPartHeight;
                } else if (part.type === 'image') {
                    const imgPlaceholder = `[Image: ${part.alt || 'attached'}]`; doc.setFont('helvetica', 'italic'); doc.setTextColor(metaColor);
                    const lines = doc.splitTextToSize(imgPlaceholder, availableWidth); const placeholderHeight = lines.length * regularFontSize * lineHeightFactor;
                    doc.text(lines, partX, currentY, { align: alignment, maxWidth: availableWidth }); currentY += placeholderHeight; doc.setFont('helvetica', 'normal'); // Reset font
                }
                currentY += spaceAfterInfoLine; // Add small space between parts
            }
            currentY += spaceAfterMessage - spaceAfterInfoLine; // Adjust Y for next message block
        }
        // Generate filename
        const fileName = `momcare-chat-${userProfile?.name?.replace(/\s+/g, '_') ?? 'user'}-session_${currentSessionId?.slice(-6) ?? 'current'}-${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
        doc.save(fileName);
        toast({ title: "PDF Exported Successfully", description: fileName });
    } catch (error) {
        console.error("PDF Export failed:", error);
        toast({ title: "PDF Export Failed", description: error instanceof Error ? error.message : "Unknown PDF error.", variant: "destructive" });
    } finally {
        setIsExportingPdf(false);
    }
  }, [messages, toast, userProfile, chatStartWeeksPregnant, currentSessionId]);


  // --- Dynamic Conversation Starters ---
  const renderConversationStarters = useMemo(() => {
    // Only show early in an active chat session
    if (showPreChat || messages.length > 2 || !currentSessionId) return null;

    const starters = [
      "Common first trimester symptoms?",
      "Healthy snack ideas?",
      "Fetal development this week?",
      "Safe exercises?",
      "Managing morning sickness?",
      "Braxton Hicks vs real contractions?",
    ];
    // Optionally add trimester-specific starters based on `pregnancyTrimester`

    return (
      <div className="mt-4 mb-2 px-4 shrink-0">
        <p className="text-xs text-gray-500 mb-2 text-center">Conversation Starters:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {starters.slice(0, 4).map((starter, index) => ( // Limit starters shown
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="text-xs h-auto py-1 px-2 border-momcare-primary/50 text-momcare-primary hover:bg-momcare-primary/10"
              onClick={() => handleSendMessage(starter)}
              disabled={isLoading || !chatSession} // Disable if loading or no active Gemini session
            >
              {starter}
            </Button>
          ))}
        </div>
      </div>
    );
  }, [showPreChat, messages.length, isLoading, chatSession, handleSendMessage, pregnancyTrimester, currentSessionId]); // Added currentSessionId


  // --- Trimester-specific Styling ---
  const getTrimesterBorderColor = useCallback((): string => {
      switch (pregnancyTrimester) {
          case 1: return 'border-t-4 border-t-pink-400';
          case 2: return 'border-t-4 border-t-purple-400';
          case 3: return 'border-t-4 border-t-blue-400';
          default: return 'border-t-4 border-t-momcare-primary/20'; // Default or unknown
      }
  }, [pregnancyTrimester]);


  // --- Render Logic ---
  return (
    <MainLayout>
      <TooltipProvider delayDuration={100}>
        {/* Hidden File Input for Image Upload */}
        <input
          type="file" ref={imageInputRef} onChange={handleImageUpload}
          accept="image/png, image/jpeg, image/webp, image/gif, image/heic, image/heif"
          style={{ display: 'none' }} aria-hidden="true"
        />

        {/* PDF Confirm Dialog */}
        <Dialog open={showPdfConfirm} onOpenChange={setShowPdfConfirm}>
             <DialogContent>
                 <DialogHeader>
                     <DialogTitle>Confirm PDF Export</DialogTitle>
                     <DialogDescription>
                         Export the current chat session ({currentSessionId ? `...${currentSessionId.slice(-6)}` : 'New Chat'})? Sensitive info might be included.
                     </DialogDescription>
                 </DialogHeader>
                 <DialogFooter>
                     <Button variant="outline" onClick={() => setShowPdfConfirm(false)}>Cancel</Button>
                     <Button onClick={handleExportPDF} disabled={isExportingPdf || messages.length === 0}>
                         {isExportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                         Export PDF
                     </Button>
                 </DialogFooter>
             </DialogContent>
         </Dialog>

        {/* Main Container with Sidebar */}
        <div className="flex h-[calc(100vh-60px)] bg-white"> {/* Main flex container */}

          {/* Sidebar */}
          {user && ( // Show sidebar only when user is logged in
            <ChatHistorySidebar
            onSelectSession={handleLoadSession}
            currentSessionId={currentSessionId}
            className="flex-shrink-0"
            onSessionDeleted={handleSessionDeleted} // <-- Pass the callback
          />
          )}

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col overflow-hidden"> {/* Takes remaining space */}
            {/* Container for Pre-Chat or Active Chat */}
            <div className={`max-w-4xl mx-auto px-2 sm:px-4 py-6 flex flex-col h-full w-full`}>

              {showPreChat ? (
                // Pre-Chat Card (Centered)
                <Card className={`border ${getTrimesterBorderColor()} overflow-hidden flex-1 flex flex-col max-w-2xl mx-auto w-full`}>
                   <CardHeader>
                       <CardTitle>Welcome to MomCare AI!</CardTitle>
                       <CardDescription>Tell me a bit about yourself to start a new chat.</CardDescription>
                   </CardHeader>
                   <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                      {isContextLoading ? (
                         <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-momcare-primary" /></div>
                      ) : (
                         <>
                             {/* Feeling Select */}
                             <div className="space-y-1">
                                 <Label htmlFor="feeling">How are you feeling today?</Label>
                                 <Select value={feeling} onValueChange={setFeeling}>
                                     <SelectTrigger id="feeling"><SelectValue placeholder="Select how you feel..." /></SelectTrigger>
                                     <SelectContent>
                                         <SelectItem value="generally well">Generally Well</SelectItem>
                                         <SelectItem value="a bit tired">A bit tired</SelectItem>
                                         <SelectItem value="nauseous">Nauseous</SelectItem>
                                         <SelectItem value="anxious or worried">Anxious or Worried</SelectItem>
                                         <SelectItem value="excited">Excited</SelectItem>
                                         <SelectItem value="uncomfortable">Uncomfortable</SelectItem>
                                         <SelectItem value="other">Other</SelectItem>
                                     </SelectContent>
                                 </Select>
                             </div>
                             {/* Age & Weeks Grid */}
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 <div className="space-y-1"> <Label htmlFor="age">Your Age</Label> <Input id="age" type="number" placeholder={userProfile?.age ? `Current: ${userProfile.age}` : "e.g., 30"} value={age} onChange={(e) => setAge(e.target.value)} /> </div>
                                 <div className="space-y-1"> <Label htmlFor="weeksPregnant">Weeks Pregnant (Optional)</Label> <Input id="weeksPregnant" type="number" placeholder={userProfile?.weeksPregnant !== undefined ? `Current: ${userProfile.weeksPregnant}` : "e.g., 12"} value={weeksPregnant} onChange={(e) => setWeeksPregnant(e.target.value)} /> </div>
                             </div>
                             {/* Conditions Textarea */}
                             <div className="space-y-1"> <Label htmlFor="conditions">Pre-existing Conditions (Optional)</Label> <Textarea id="conditions" placeholder={userProfile?.preExistingConditions ? `Current: ${userProfile.preExistingConditions}` : "e.g., Asthma, Diabetes"} value={preExistingConditions} onChange={(e) => setPreExistingConditions(e.target.value)} rows={2} /> </div>
                             {/* Concerns Textarea */}
                             <div className="space-y-1"> <Label htmlFor="concerns">Specific Concerns Today? (Optional)</Label> <Textarea id="concerns" placeholder="e.g., Back pain, diet questions" value={specificConcerns} onChange={(e) => setSpecificConcerns(e.target.value)} rows={2} /> </div>
                         </>
                     )}
                   </CardContent>
                   <CardFooter>
                       <Button onClick={handleStartChat} disabled={isStartingChat || isContextLoading || !feeling || !age} className="w-full">
                           {isStartingChat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Start New Chat
                       </Button>
                   </CardFooter>
                   {error && <p className="text-red-600 text-sm p-4 text-center">{error}</p>}
                </Card>
              ) : (
                // Active Chat Interface
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                  <Card className={`flex-1 flex flex-col overflow-hidden border ${getTrimesterBorderColor()}`}>
                    {/* Chat Header */}
                    <CardHeader className="border-b p-2 sm:p-3 flex flex-row items-center justify-between shrink-0">
                        <CardTitle className="text-base sm:text-lg font-semibold truncate pr-2">
                            MomCare AI {currentSessionId ? `(Session ...${currentSessionId.slice(-4)})` : ''}
                        </CardTitle>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                            {/* Clear View Button */}
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-gray-500 hover:text-red-500" onClick={handleClearChat} disabled={isLoading} aria-label="Clear chat view"><Trash2 className="h-4 w-4 sm:h-5 sm:w-5" /></Button></TooltipTrigger><TooltipContent>Clear Chat View</TooltipContent></Tooltip>
                            {/* New Chat Button */}
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-gray-500 hover:text-momcare-primary" onClick={handleRestartChat} disabled={isLoading || isStartingChat} aria-label="Start new chat"><RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" /></Button></TooltipTrigger><TooltipContent>New Chat</TooltipContent></Tooltip>
                            {/* Export PDF Button */}
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-gray-500 hover:text-blue-500" onClick={() => setShowPdfConfirm(true)} disabled={isLoading || isExportingPdf || messages.length === 0} aria-label="Export chat as PDF"><Share2 className="h-4 w-4 sm:h-5 sm:w-5" /></Button></TooltipTrigger><TooltipContent>Export as PDF</TooltipContent></Tooltip>
                        </div>
                    </CardHeader>

                    {/* Message Area */}
                    <CardContent className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 scroll-smooth bg-gray-50/30">
                       {/* Loading Indicator when loading session */}
                       {isLoading && messages.length === 0 && !streamingResponse && !isStartingChat && (
                           <div className="flex justify-center items-center h-full">
                               <Loader2 className="h-8 w-8 animate-spin text-momcare-primary" />
                               <span className="ml-3 text-gray-600">Loading Chat...</span>
                           </div>
                       )}
                       {/* Rendered Messages */}
                       {messages.map((message, index) => (
                           <div key={`${message.role}-${index}-${message.parts.length}-${currentSessionId || 'new'}`} // Unique key per message within session
                                className={`flex items-end space-x-2 ${message.role === 'user' ? 'justify-end pl-8 sm:pl-10' : 'justify-start pr-8 sm:pr-10'}`}>
                               {/* Bot Icon */}
                               {message.role === 'model' && <Bot className="h-5 w-5 text-momcare-primary/70 mb-1 flex-shrink-0" aria-label="AI Icon"/>}
                               {/* Message Bubble */}
                               <div className={`text-white relative group max-w-[85%] rounded-xl shadow-sm flex flex-col ${ message.role === 'user' ? 'bg-momcare-primary text-white rounded-br-none items-end' : 'bg-white text-gray-900 rounded-tl-none border border-gray-200 items-start' }`}>
                                   {/* Message Parts (Text/Image) */}
                                   {message.parts.map((part, partIndex) => (
                                       <div key={`${index}-${partIndex}`} className={`px-3 py-1 sm:px-4 sm:py-1 first:pt-2 last:pb-2 w-full ${part.type === 'image' ? 'my-1' : ''}`}>
                                           {/* Text Part */}
                                           {part.type === 'text' ? (
                         // *** MODIFIED LINE BELOW *** Added conditional text-white for user messages
                         <div className={`prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-a:text-momcare-secondary hover:prose-a:text-momcare-accent prose-a:underline ${message.role === 'user' ? 'text-white' : ''}`}>
                             <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }: AnchorProps) => <a target="_blank" rel="noopener noreferrer" {...props} /> }}>
                                 {part.content}
                             </ReactMarkdown>
                         </div>
                     ) : null}
                                           {/* Image Part */}
                                           {part.type === 'image' && part.content ? (
                                               <img src={part.content} alt={part.alt || 'User uploaded image'} className="max-w-full h-auto max-h-48 sm:max-h-60 object-contain rounded-md border border-gray-300 my-1"
                                                   onError={(e) => { console.warn(`Failed to load image: ${part.content}`); (e.target as HTMLImageElement).style.display = 'none'; const p = document.createElement('div'); p.textContent = `[Image load error: ${part.alt || 'image'}]`; p.className = 'text-xs text-red-500 italic p-2'; (e.target as HTMLImageElement).parentNode?.insertBefore(p, e.target as HTMLImageElement); }}
                                               />
                                           ) : null}
                                       </div>
                                   ))}
                                   {/* Bookmark Button */}
                                   {message.role === 'model' && message.parts.some(p => p.type === 'text' && p.content?.trim()) && (
                                       <Tooltip>
                                           <TooltipTrigger asChild>
                                               <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 p-1 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100"
                                                   onClick={() => handleBookmarkClick(message.parts.find(p => p.type === 'text' && p.content?.trim())?.content || '')} aria-label="Bookmark this message" >
                                                   <Bookmark className="h-3.5 w-3.5" />
                                               </Button>
                                           </TooltipTrigger>
                                           <TooltipContent side="top">Bookmark</TooltipContent>
                                       </Tooltip>
                                   )}
                               </div>
                               {/* User Icon */}
                               {message.role === 'user' && <User className="h-5 w-5 text-gray-500 mb-1 flex-shrink-0" aria-label="User Icon"/>}
                           </div>
                       ))}

                      {/* Streaming AI Response */}
                      {streamingResponse && (
                        <div className="flex items-end space-x-2 justify-start pr-8 sm:pr-10">
                          <Bot className="h-5 w-5 text-momcare-primary/70 mb-1 flex-shrink-0" aria-label="AI Icon"/>
                          <div className="max-w-[85%] px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-sm bg-white text-gray-900 rounded-tl-none border border-gray-200">
                            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-a:text-momcare-secondary hover:prose-a:text-momcare-accent prose-a:underline">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }: AnchorProps) => <a target="_blank" rel="noopener noreferrer" {...props} /> }}>
                                {streamingResponse}
                              </ReactMarkdown>
                              <span className="inline-block animate-pulse">▍</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Loading Indicator (Thinking...) */}
                      {isLoading && !streamingResponse && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                         <div className="flex items-center justify-center py-2">
                            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                <Loader2 className="h-3 w-3 animate-spin mr-1" /> Thinking...
                            </div>
                         </div>
                      )}

                      {/* Error Display Area */}
                      {error && (
                          <div className="flex items-center justify-center p-2">
                              <div className="inline-flex items-center p-2 rounded-md text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                                  <AlertTriangle className="h-4 w-4 mr-1 flex-shrink-0" /> {error}
                              </div>
                          </div>
                      )}

                      {/* Scroll Anchor */}
                      <div ref={messagesEndRef} />
                    </CardContent>

                    {/* Conversation Starters */}
                    {renderConversationStarters}

                    {/* Input Area */}
                    <CardFooter className="border-t p-3 sm:p-4 bg-white shrink-0 flex flex-col items-stretch">
                       {/* Pending Image Preview */}
                       {pendingImageFile && pendingImagePreviewUrl && (
                         <div className="mb-2 flex items-center p-2 border rounded-lg bg-gray-50">
                           <div className="flex flex-1 items-center overflow-hidden min-w-0">
                              <img src={pendingImagePreviewUrl} alt="Selected preview" className="h-10 w-10 object-cover rounded mr-2 flex-shrink-0 border" />
                              <span className="text-sm text-gray-600 truncate flex-1">{pendingImageFile.name}</span>
                           </div>
                           <Tooltip>
                               <TooltipTrigger asChild>
                                   <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-500 hover:text-red-500 flex-shrink-0 ml-2" onClick={handleRemovePendingImage} aria-label="Remove attached image">
                                       <X className="h-4 w-4" />
                                   </Button>
                               </TooltipTrigger>
                               <TooltipContent>Remove Image</TooltipContent>
                           </Tooltip>
                         </div>
                       )}
                       {/* Input Row */}
                       <div className="flex items-center gap-2">
                          {/* Attach Image Button */}
                          <Tooltip>
                              <TooltipTrigger asChild>
                                  <Button onClick={handleImageAttachClick} variant="ghost" size="icon" className="rounded-full h-9 w-9 flex-shrink-0 text-gray-500 hover:text-momcare-primary disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLoading || !!pendingImageFile || isRecording || !currentSessionId} aria-label="Attach image">
                                      <ImagePlus className="h-5 w-5" />
                                  </Button>
                              </TooltipTrigger>
                              <TooltipContent>Attach Image</TooltipContent>
                          </Tooltip>
                          {/* Text Input */}
                         <Input
                             placeholder={ isRecording ? "Listening..." : pendingImageFile ? "Add comment about image (optional)..." : "Ask about symptoms, feelings..." }
                             value={inputMessage}
                             onChange={(e) => setInputMessage(e.target.value)}
                             onKeyDown={handleKeyDown}
                             disabled={isLoading || !chatSession || isRecording || !currentSessionId} // Disable if no active session
                             className="flex-1 h-9"
                             aria-label="Chat message input"
                         />
                         {/* Voice Input Button */}
                         <Tooltip>
                             <TooltipTrigger asChild>
                                 <Button onClick={handleVoiceInput} variant={isRecording ? "destructive" : "ghost"} size="icon" className={`rounded-full h-9 w-9 flex-shrink-0 ${isRecording ? 'text-white' : 'text-gray-500 hover:text-momcare-primary'} disabled:opacity-50`} disabled={isLoading || !chatSession || !currentSessionId} aria-label={isRecording ? "Stop recording" : "Start voice input"}>
                                     <Mic className={`h-5 w-5 ${isRecording ? 'animate-pulse' : ''}`} />
                                 </Button>
                             </TooltipTrigger>
                             <TooltipContent>{isRecording ? "Stop Recording" : "Use Voice"}</TooltipContent>
                         </Tooltip>
                         {/* Send Button */}
                         <Tooltip>
                             <TooltipTrigger asChild>
                                 <Button onClick={() => handleSendMessage()} disabled={(!inputMessage.trim() && !pendingImageFile) || isLoading || !chatSession || isRecording || !currentSessionId} className="bg-momcare-primary hover:bg-momcare-dark px-3 h-9 flex-shrink-0" aria-label="Send message">
                                     {/* Show loader only when sending/processing, not when starting new chat */}
                                     {isLoading && !isStartingChat ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                                 </Button>
                             </TooltipTrigger>
                             <TooltipContent>Send</TooltipContent>
                         </Tooltip>
                       </div>
                    </CardFooter>
                  </Card>
                </div>
              )}
            </div> {/* End Pre-Chat / Active Chat container */}
          </div> {/* End Main Chat Area Flex Item */}
        </div> {/* End Main Flex Container */}
      </TooltipProvider>
    </MainLayout>
  );
};

export default ChatPage;