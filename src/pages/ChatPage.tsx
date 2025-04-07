// src/pages/ChatPage.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, isAfter, parseISO } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Added Tooltip
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, User, Bot, RefreshCw, Sparkles, MessageSquarePlus, Trash2 } from 'lucide-react'; // Added Trash2

// Import Appwrite functions and types
import {
    getUserProfile,
    UserProfile,
    getBloodPressureReadings,
    getBloodSugarReadings,
    getWeightReadings,
    getUserAppointments,
    BloodPressureReading,
    BloodSugarReading,
    WeightReading,
    Appointment
} from '@/lib/appwrite';

// Import Gemini service and types
import geminiService, { ChatSession, ChatMessage, UserPreferences } from '@/lib/gemini';
import { useAuthStore } from '@/store/authStore';

// Helper to parse appointment date/time
const parseAppointmentDateTime = (app: Appointment): Date | null => {
    // ... (parsing logic remains the same)
    if (!app?.date || !app?.time) return null;
    try {
        const datePart = app.date.split('T')[0];
        const baseDate = parseISO(`${datePart}T00:00:00`);
        if (isNaN(baseDate.getTime())) return null;
        const timeMatch = app.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (!timeMatch) return null;
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const period = timeMatch[3]?.toUpperCase();
        if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) return null;
        if (period) {
            if (hours < 1 || hours > 12) return null;
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
        } else {
            if (hours < 0 || hours > 23) return null;
        }
        const combinedDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes);
        return isNaN(combinedDate.getTime()) ? null : combinedDate;
    } catch (error) {
        console.error('Error parsing appointment date/time:', app.date, app.time, error);
        return null;
    }
};


const ChatPage = () => {
  // --- Component State ---
  const [showPreChat, setShowPreChat] = useState(true);
  const [isLoading, setIsLoading] = useState(false); // AI response loading
  const [isStartingChat, setIsStartingChat] = useState(false); // Start chat button loading
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuthStore();

  // --- Pre-chat Form State ---
  const [feeling, setFeeling] = useState('');
  const [age, setAge] = useState('');
  const [weeksPregnant, setWeeksPregnant] = useState(''); // Form input override
  const [preExistingConditions, setPreExistingConditions] = useState('');
  const [specificConcerns, setSpecificConcerns] = useState('');

  // --- Fetched Context State ---
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [latestBp, setLatestBp] = useState<BloodPressureReading | null>(null);
  const [latestSugar, setLatestSugar] = useState<BloodSugarReading | null>(null);
  const [latestWeight, setLatestWeight] = useState<WeightReading | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [isContextLoading, setIsContextLoading] = useState(true); // Combined loading state

  // --- Fetch Initial Context (Profile, Readings, Appointments) ---
  const fetchInitialContext = useCallback(async () => {
    if (!user?.$id) {
        setIsContextLoading(false);
        return;
    }
    setIsContextLoading(true);
    setError(null); // Clear previous errors on refetch
    // Reset form fields that depend on profile data before fetching
    setAge('');
    setPreExistingConditions('');
    // console.log("ChatPage: Fetching initial context for user:", user.$id);

    try {
        const results = await Promise.allSettled([
            getUserProfile(user.$id),
            getBloodPressureReadings(user.$id, 1),
            getBloodSugarReadings(user.$id, 1),
            getWeightReadings(user.$id, 1),
            getUserAppointments(user.$id)
        ]);

        // Process Profile
        if (results[0].status === 'fulfilled') {
            const profileData = results[0].value;
            setUserProfile(profileData);
            // console.log("ChatPage: Profile data fetched:", profileData);
            if (profileData) {
                // Pre-fill form fields from profile
                if (profileData.age) setAge(profileData.age.toString());
                if (profileData.preExistingConditions) setPreExistingConditions(profileData.preExistingConditions);
            }
        } else {
            console.error("ChatPage: Error fetching profile:", results[0].reason);
            toast({ title: "Profile Error", description: "Could not load profile data.", variant: "destructive" });
            setUserProfile(null);
        }

        // Process Latest Readings
        if (results[1].status === 'fulfilled' && results[1].value.length > 0) setLatestBp(results[1].value[0]); else setLatestBp(null);
        if (results[2].status === 'fulfilled' && results[2].value.length > 0) setLatestSugar(results[2].value[0]); else setLatestSugar(null);
        if (results[3].status === 'fulfilled' && results[3].value.length > 0) setLatestWeight(results[3].value[0]); else setLatestWeight(null);

        // Process Appointments (Filter for upcoming)
        if (results[4].status === 'fulfilled') {
            const allAppointments = results[4].value || [];
            const now = new Date();
            const futureAppointments = allAppointments
                .map(app => ({ ...app, dateTime: parseAppointmentDateTime(app) }))
                .filter(app => app.dateTime && isAfter(app.dateTime, now) && !app.isCompleted)
                .sort((a, b) => a.dateTime!.getTime() - b.dateTime!.getTime());
            setUpcomingAppointments(futureAppointments.slice(0, 3));
        } else {
            console.error("ChatPage: Error fetching appointments:", results[4].reason);
            setUpcomingAppointments([]);
        }

    } catch (err) {
        console.error("ChatPage: Critical error fetching initial context:", err);
        toast({ title: "Context Error", description: "Could not load all initial data.", variant: "destructive" });
        setUserProfile(null); setLatestBp(null); setLatestSugar(null); setLatestWeight(null); setUpcomingAppointments([]);
        setError("Failed to load essential data. Please try refreshing the page.");
    } finally {
        setIsContextLoading(false);
    }
  }, [user, toast]); // Removed specific reading/profile states from deps

  // Fetch context on mount or when user changes
  useEffect(() => {
    fetchInitialContext();
  }, [fetchInitialContext]);

  // Scroll to bottom effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingResponse]);

  // --- Start Chat Handler ---
  const handleStartChat = async () => {
    // Validation
    if (!feeling) { toast({ title: "Please select how you're feeling", variant: "destructive" }); return; }
    if (!age || isNaN(Number(age)) || Number(age) <= 0) { toast({ title: "Please enter a valid age", variant: "destructive" }); return; }
    const formWeeksNum = weeksPregnant ? parseInt(weeksPregnant, 10) : undefined;
    if (weeksPregnant && (isNaN(formWeeksNum) || formWeeksNum < 0 || formWeeksNum > 45)) {
        toast({ title: "Please enter valid weeks pregnant (0-45) or leave blank", variant: "destructive" }); return;
    }

    setIsStartingChat(true);
    setError(null);

    try {
      // Prepare User Preferences from form
      const userPrefs: UserPreferences = {
        feeling,
        age: Number(age),
        weeksPregnant: formWeeksNum,
        preExistingConditions,
        specificConcerns,
      };

      // Prepare additional context
      const additionalContext = {
          latestBp,
          latestSugar,
          latestWeight,
          upcomingAppointments,
      };
      // console.log("===== SENDING TO GEMINI =====");
      // console.log("User Preferences:", JSON.stringify(userPrefs, null, 2));
      // console.log("User Profile:", JSON.stringify(userProfile, null, 2));
      // console.log("Additional Context:", JSON.stringify({ /* ... */ }, null, 2));
      // console.log("==========================");

      // Start chat
      const chat = await geminiService.startChat(userPrefs, userProfile, additionalContext);
      setChatSession(chat);

      // Construct initial message (simplified, let gemini handle context)
      const profileName = userProfile?.name || user?.name || 'there';
      const initialModelMessage = `Hello ${profileName}! Thanks for sharing. I'm ready to chat based on the details provided.\n\nHow can I assist you today?`;

      setMessages([{ role: 'model', parts: [{ text: initialModelMessage }] }]);
      setShowPreChat(false);

    } catch (error) {
      console.error('Error starting chat:', error);
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred.";
      setError(`Failed to start chat: ${errorMsg}`);
      toast({ title: "Failed to start chat", description: errorMsg, variant: "destructive" });
    } finally {
      setIsStartingChat(false);
    }
  };

  // --- Send Message Handler ---
  const handleSendMessage = async (messageToSendOverride?: string) => {
    const messageText = messageToSendOverride || inputMessage.trim();
    if (!messageText || !chatSession || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: messageText }] };

    if (!messageToSendOverride) {
        setInputMessage('');
    }
    setMessages(prev => [...prev, userMessage]);
    setStreamingResponse('');
    setIsLoading(true);
    setError(null);

    let accumulatedResponse = "";

    try {
        await geminiService.sendMessageStream(
            chatSession,
            messageText,
            (chunk) => { accumulatedResponse += chunk; setStreamingResponse(accumulatedResponse); },
            (streamError) => {
                console.error('Streaming Error:', streamError);
                setError(`Error receiving response: ${streamError.message}`);
                toast({ title: "Response Error", description: streamError.message, variant: "destructive" });
                setIsLoading(false); setStreamingResponse('');
                setMessages(prev => [...prev, { role: 'model', parts: [{ text: `[Sorry, I encountered an error processing that. ${streamError.message}]` }] }]);
            },
            () => {
                setIsLoading(false); setStreamingResponse('');
                if (accumulatedResponse) {
                    setMessages(prev => [...prev, { role: 'model', parts: [{ text: accumulatedResponse }] }]);
                }
            }
        );

    } catch (error) {
        console.error('Error initiating send message stream:', error);
        const errorMsg = error instanceof Error ? error.message : "An unknown error occurred.";
        setError(`Failed to send message: ${errorMsg}`);
        toast({ title: "Failed to send message", description: errorMsg, variant: "destructive" });
        setIsLoading(false); setStreamingResponse('');
        setMessages(prev => [...prev, { role: 'model', parts: [{ text: `[Sorry, failed to send message: ${errorMsg}]` }] }]);
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
        e.preventDefault();
        handleSendMessage();
    }
  };

  // --- Clear Chat Handler ---
  const handleClearChat = () => {
    if (isLoading) return; // Don't clear while loading response
    setMessages([]);
    setStreamingResponse('');
    setError(null); // Clear any errors shown in the chat area
    toast({ title: "Chat Cleared", description: "Messages removed from view." });
    // Note: The chatSession and its history remain active for the AI
  };

  // --- Restart Chat Handler ---
  const handleRestartChat = () => {
    if (isLoading || isStartingChat || isContextLoading) return; // Prevent restart during critical operations

    // Reset chat state
    setMessages([]);
    setStreamingResponse('');
    setError(null);
    setChatSession(null); // End the current session

    // Reset temporary pre-chat form fields (profile-based ones will be refetched)
    setFeeling('');
    setWeeksPregnant('');
    setSpecificConcerns('');

    // Go back to pre-chat screen
    setShowPreChat(true);

    // Refetch context to ensure pre-chat form has latest profile data
    fetchInitialContext();

    toast({ title: "Chat Restarted", description: "Starting a new conversation." });
  };


  // --- Contextual Conversation Starters ---
  const renderConversationStarters = () => {
    // Show only after pre-chat is hidden and the first model message has arrived
    if (showPreChat || messages.length < 1 || isLoading) { // Show even if only user message exists
        return null;
    }

    const starters: { label: string; prompt: string; condition?: boolean }[] = [];
    const effectiveWeek = parseInt(weeksPregnant || userProfile?.weeksPregnant?.toString() || '-1', 10);

    // Add starters based on conditions
    if (effectiveWeek >= 1 && effectiveWeek <= 13) {
        starters.push({ label: "Ask about morning sickness", prompt: "What are common tips for managing morning sickness?", condition: true });
    }
    if (effectiveWeek >= 14 && effectiveWeek <= 27) {
        starters.push({ label: "Learn about fetal movement", prompt: "When should I expect to feel my baby move?", condition: true });
    }
    if (effectiveWeek >= 28) {
         starters.push({ label: "Prepare for labor signs", prompt: "What are the early signs of labor?", condition: true });
    }

    const conditions = preExistingConditions || userProfile?.preExistingConditions || '';
    if (conditions.toLowerCase().includes('diabetes')) {
        starters.push({ label: "Tips for managing blood sugar", prompt: "Can you give me some general tips for managing blood sugar during pregnancy with diabetes?", condition: true });
    }
    if (conditions.toLowerCase().includes('hypertension')) {
        starters.push({ label: "Info on hypertension", prompt: "What should I know about managing hypertension in pregnancy?", condition: true });
    }
     if (userProfile?.activityLevel === 'sedentary' || userProfile?.activityLevel === 'light') {
        starters.push({ label: "Gentle exercise ideas", prompt: "What are some gentle exercises suitable for pregnancy?", condition: true });
    }
     if (upcomingAppointments.length > 0) {
         const nextAppt = upcomingAppointments[0];
         const formattedDate = nextAppt.dateTime ? format(nextAppt.dateTime, 'MMM d') : 'upcoming';
         starters.push({ label: `Prepare for ${formattedDate} appt.`, prompt: `How can I best prepare for my upcoming ${nextAppt.appointmentType || 'doctor'} appointment on ${formattedDate}?`, condition: true });
     }

    // Add generic starters
    starters.push({ label: "Nutrition advice", prompt: "What are some key nutrients I need during pregnancy?", condition: true });
    starters.push({ label: "Common discomforts", prompt: "What are some common discomforts during pregnancy and how to manage them?", condition: true });

    // Filter based on condition and limit the number shown
    const filteredStarters = starters.filter(s => s.condition !== false).slice(0, 4); // Show max 4

    if (filteredStarters.length === 0) return null;

    return (
        <div className="mt-4 mb-2 px-4 shrink-0"> {/* Added shrink-0 */}
            <p className="text-xs text-gray-500 mb-2 text-center">Or try one of these starters:</p>
            <div className="flex flex-wrap justify-center gap-2">
                {filteredStarters.map((starter, index) => (
                    <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="text-xs h-auto py-1 px-2 border-momcare-primary/50 text-momcare-primary hover:text-momcare-dark hover:bg-momcare-primary/10"
                        onClick={() => handleSendMessage(starter.prompt)}
                        disabled={isLoading}
                    >
                        <Sparkles className="h-3 w-3 mr-1.5" />
                        {starter.label}
                    </Button>
                ))}
            </div>
        </div>
    );
  };


  // --- Render Logic ---
  return (
    <MainLayout>
      <TooltipProvider delayDuration={100}> {/* Wrap with TooltipProvider */}
        <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col h-[calc(100vh-80px)]">
          <h1 className="text-3xl font-bold text-momcare-primary mb-6 text-center shrink-0">
            MomCare AI Assistant
          </h1>

          {/* Pre-Chat Form */}
          {showPreChat && (
            <Card className="border-momcare-primary/20 overflow-hidden flex-1 flex flex-col">
              <CardHeader>
                <CardTitle>Before we begin...</CardTitle>
                <CardDescription>
                  Sharing a few details helps me provide more relevant information. Profile info will be used automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 overflow-y-auto px-6 pb-6">
                {isContextLoading ? (
                   <div className="flex items-center justify-center py-10 text-gray-500">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading context...
                   </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="feeling">How are you feeling today? *</Label>
                      <Select value={feeling} onValueChange={setFeeling}>
                        <SelectTrigger id="feeling"><SelectValue placeholder="Select your current feeling" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Happy">Happy</SelectItem> <SelectItem value="Okay">Okay</SelectItem>
                          <SelectItem value="Anxious">Anxious</SelectItem> <SelectItem value="Excited">Excited</SelectItem>
                          <SelectItem value="Tired">Tired</SelectItem> <SelectItem value="Worried">Worried</SelectItem>
                          <SelectItem value="Stressed">Stressed</SelectItem> <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="age">Your Age *</Label>
                        <Input id="age" type="number" placeholder="e.g., 30" value={age} onChange={(e) => setAge(e.target.value)} min="15" max="99" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="weeksPregnant">Weeks Pregnant (override)</Label>
                        <Input id="weeksPregnant" type="number" placeholder="e.g., 16" value={weeksPregnant} onChange={(e) => setWeeksPregnant(e.target.value)} min="0" max="45" />
                         {!weeksPregnant && userProfile?.weeksPregnant !== undefined && (
                             <p className="text-xs text-gray-500">Leave blank to use week {userProfile.weeksPregnant} from profile.</p>
                         )}
                         {!weeksPregnant && userProfile?.weeksPregnant === undefined && (
                             <p className="text-xs text-gray-500">Enter current week, or update profile.</p>
                         )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="conditions">Pre-existing Conditions (optional)</Label>
                      <Input id="conditions" placeholder="e.g., Diabetes, Hypertension" value={preExistingConditions} onChange={(e) => setPreExistingConditions(e.target.value)} />
                       {preExistingConditions !== userProfile?.preExistingConditions && userProfile?.preExistingConditions && (
                           <p className="text-xs text-gray-500">Profile value: {userProfile.preExistingConditions}</p>
                       )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="concerns">Specific Concerns Today? (optional)</Label>
                      <Textarea id="concerns" placeholder="e.g., Questions about nausea, preparing for..." value={specificConcerns} onChange={(e) => setSpecificConcerns(e.target.value)} className="min-h-[80px]" />
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter className="border-t pt-6 flex flex-col items-center">
                 {error && ( <p className="text-sm text-red-600 mb-4 text-center w-full">{error}</p> )}
                <Button
                  onClick={handleStartChat}
                  className="w-full bg-momcare-primary hover:bg-momcare-dark"
                  disabled={isStartingChat || isContextLoading} // Disable while starting or loading context
                >
                  {isContextLoading ? ( <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Context...</> )
                   : isStartingChat ? ( <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting Chat...</> )
                   : ( "Start Chat" )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Chat Interface */}
          {!showPreChat && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <Card className="flex-1 flex flex-col overflow-hidden border-momcare-primary/20">
                {/* Card Header with Title and Action Buttons */}
                <CardHeader className="border-b p-3 flex flex-row items-center justify-between shrink-0">
                    <CardTitle className="text-lg font-semibold text-momcare-primary">Chat</CardTitle>
                    <div className="flex items-center space-x-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handleClearChat} disabled={isLoading || messages.length === 0} className="h-8 w-8 text-gray-500 hover:text-gray-700">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Clear Chat Messages</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Clear Chat Messages</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handleRestartChat} disabled={isLoading || isStartingChat || isContextLoading} className="h-8 w-8 text-gray-500 hover:text-gray-700">
                                    <RefreshCw className="h-4 w-4" />
                                    <span className="sr-only">Restart Chat</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Restart Chat (New Session)</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </CardHeader>

                {/* Message Display Area */}
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}-${message.parts[0].text.substring(0, 10)}`} // Basic key
                      className={`flex ${message.role === 'user' ? 'justify-end pl-10' : 'justify-start pr-10'}`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-xl shadow-sm ${
                          message.role === 'user'
                            ? 'bg-momcare-primary text-white rounded-br-none'
                            : 'bg-gray-100 text-gray-900 rounded-tl-none'
                        }`}
                      >
                        <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>
                          {message.parts[0].text}
                        </p>
                      </div>
                    </div>
                  ))}
                  {streamingResponse && (
                    <div className="flex justify-start pr-10">
                      <div className="max-w-[85%] px-4 py-2.5 rounded-xl shadow-sm bg-gray-100 text-gray-900 rounded-tl-none">
                        <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>
                          {streamingResponse}
                          <span className="inline-block w-1 h-4 bg-gray-600 animate-pulse ml-1 align-middle"></span>
                        </p>
                      </div>
                    </div>
                  )}
                  {isLoading && !streamingResponse && messages.length > 0 && messages[messages.length - 1].role === 'user' && ( // Show thinking only after user message
                    <div className="flex justify-start pr-10">
                      <div className="max-w-[85%] px-4 py-2.5 rounded-xl shadow-sm bg-gray-100 text-gray-900 rounded-tl-none">
                         <div className="flex items-center text-sm text-gray-500">
                           <Loader2 className="h-4 w-4 animate-spin mr-2" /> Thinking...
                         </div>
                      </div>
                    </div>
                  )}
                  {/* Scroll anchor */}
                  <div ref={messagesEndRef} />
                </CardContent>

                {/* Render Conversation Starters */}
                {renderConversationStarters()}

                {/* Input Area */}
                <CardFooter className="border-t p-4 bg-white shrink-0"> {/* Added shrink-0 */}
                   {error && !isLoading && ( <p className="text-xs text-red-600 mb-2 text-center w-full">{error}</p> )}
                  <div className="flex w-full items-center space-x-2">
                    <Input
                      placeholder="Ask about symptoms, nutrition, preparation..."
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isLoading || !chatSession}
                      className="flex-1"
                      aria-label="Chat message input"
                    />
                    <Button
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || isLoading || !chatSession}
                      className="bg-momcare-primary hover:bg-momcare-dark px-3"
                      aria-label="Send message"
                    >
                      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      </TooltipProvider>
    </MainLayout>
  );
};

export default ChatPage;