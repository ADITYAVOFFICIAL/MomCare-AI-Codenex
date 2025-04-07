// src/pages/ChatPage.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, User, Bot, RefreshCw } from 'lucide-react';
// Import default export and types from gemini.ts
import geminiService, { ChatSession, ChatMessage, UserPreferences } from '@/lib/gemini';
import { useAuthStore } from '@/store/authStore';
import { getUserProfile, UserProfile } from '@/lib/appwrite'; // Import profile functions and type

const ChatPage = () => {
  const [showPreChat, setShowPreChat] = useState(true);
  const [isLoading, setIsLoading] = useState(false); // General loading for AI response
  const [isStartingChat, setIsStartingChat] = useState(false); // Specific loading for start chat button
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuthStore();

  // Pre-chat form state
  const [feeling, setFeeling] = useState('');
  const [age, setAge] = useState('');
  const [weeksPregnant, setWeeksPregnant] = useState(''); // Optional form input
  const [preExistingConditions, setPreExistingConditions] = useState('');
  const [specificConcerns, setSpecificConcerns] = useState('');

  // Fetched Profile State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  // --- Fetch User Profile ---
  const fetchProfile = useCallback(async () => {
    if (!user?.$id) { setIsProfileLoading(false); return; }
    setIsProfileLoading(true);
    try {
        console.log("ChatPage: Fetching profile...");
        const profileData = await getUserProfile(user.$id);
        setUserProfile(profileData);
        console.log("ChatPage: Profile data fetched:", profileData);
        // Pre-fill form if profile exists
        if (profileData) {
             if (profileData.age) setAge(profileData.age.toString());
             if (profileData.preExistingConditions) setPreExistingConditions(profileData.preExistingConditions);
             // Note: weeksPregnant is calculated in gemini.ts, but we can keep the form field as optional override
        }
    } catch (err) {
        console.error("ChatPage: Error fetching profile:", err);
        toast({ title: "Profile Error", description: "Could not load profile data.", variant: "destructive" });
    } finally { setIsProfileLoading(false); }
  }, [user, toast]);

  // Fetch profile on mount
  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Scroll to bottom
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingResponse]);

  // --- Start Chat Handler ---
  const handleStartChat = async () => {
    // Validation
    if (!feeling) { toast({ title: "Please select how you're feeling", variant: "destructive" }); return; }
    if (!age || isNaN(Number(age)) || Number(age) <= 0) { toast({ title: "Please enter a valid age", variant: "destructive" }); return; }
    // Optional validation for weeksPregnant if you require it in the form
    // if (weeksPregnant && (isNaN(Number(weeksPregnant)) || Number(weeksPregnant) < 0 || Number(weeksPregnant) > 45)) { toast({ title: "Please enter valid weeks pregnant (0-45)", variant: "destructive" }); return; }

    setIsStartingChat(true); setError(null);

    try {
      const userPrefs: UserPreferences = {
        feeling,
        age: Number(age),
        weeksPregnant: weeksPregnant ? Number(weeksPregnant) : undefined, // Pass if entered
        preExistingConditions,
        specificConcerns,
      };

      // Pass both form preferences AND fetched profile data
      const chat = await geminiService.startChat(userPrefs, userProfile);
      setChatSession(chat);

      // Manually set the initial model message based on the logic in gemini.ts
      // (The actual history might be slightly different depending on SDK)
      const initialModelMessage = `Hello ${userProfile?.name || 'there'}! Thanks for sharing. It's understandable to feel ${feeling}${userPrefs.weeksPregnant ? ` at ${userPrefs.weeksPregnant} weeks` : ''}. I see you mentioned ${userProfile?.preExistingConditions || userPrefs.preExistingConditions || 'no specific pre-existing conditions'}.\n\n[System Note: You are MomCare AI... ALWAYS strongly advise consulting a healthcare professional...]\n\nI'm here to offer general information and support... Please remember, I can't provide medical advice... How can I assist you today?`;
      setMessages([{ role: 'model', parts: [{ text: initialModelMessage }] }]);

      setShowPreChat(false);

    } catch (error) {
      console.error('Error starting chat:', error);
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred.";
      setError(`Failed to start chat: ${errorMsg}`);
      toast({ title: "Failed to start chat", description: errorMsg, variant: "destructive" });
    } finally { setIsStartingChat(false); }
  };

  // --- Send Message Handler (Using Streaming) ---
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !chatSession || isLoading) return;

    const userMessageText = inputMessage.trim();
    const userMessage: ChatMessage = { role: 'user', parts: [{ text: userMessageText }] };

    setInputMessage('');
    setMessages(prev => [...prev, userMessage]);
    setStreamingResponse('');
    setIsLoading(true);
    setError(null);

    let accumulatedResponse = "";

    try {
        // Conceptual: Add medical context here if implemented on backend
        // const medicalContext = await getMedicalContextForQuery(user.$id, userMessageText);
        // const messageToSend = medicalContext ? `${medicalContext}\n\nUser: ${userMessageText}` : userMessageText;
        const messageToSend = userMessageText; // Send user text directly for now

        await geminiService.sendMessageStream(
            chatSession,
            messageToSend,
            (chunk) => { accumulatedResponse += chunk; setStreamingResponse(accumulatedResponse); }, // onChunk
            (streamError) => { // onError
                console.error('Streaming Error:', streamError);
                setError(`Error receiving response: ${streamError.message}`);
                toast({ title: "Response Error", description: streamError.message, variant: "destructive" });
                setIsLoading(false); setStreamingResponse('');
                setMessages(prev => [...prev, { role: 'model', parts: [{ text: `[Sorry, I encountered an error processing that. ${streamError.message}]` }] }]);
            },
            () => { // onComplete
                setIsLoading(false); setStreamingResponse('');
                if (accumulatedResponse) {
                    setMessages(prev => [...prev, { role: 'model', parts: [{ text: accumulatedResponse }] }]);
                }
                console.log("Streaming complete.");
            }
        );

    } catch (error) { // Catch errors initiating the stream
        console.error('Error initiating send message stream:', error);
        const errorMsg = error instanceof Error ? error.message : "An unknown error occurred.";
        setError(`Failed to send message: ${errorMsg}`);
        toast({ title: "Failed to send message", description: errorMsg, variant: "destructive" });
        setIsLoading(false); setStreamingResponse('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) { e.preventDefault(); handleSendMessage(); }
  };

  // --- Render Logic ---
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col h-[calc(100vh-80px)]"> {/* Adjust height */}
        <h1 className="text-3xl font-bold text-momcare-primary mb-6 text-center shrink-0">
          MomCare AI Assistant
        </h1>

        {/* Pre-Chat Form */}
        {showPreChat && (
          <Card className="border-momcare-primary/20 overflow-hidden flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>Before we begin...</CardTitle>
              <CardDescription>
                Sharing a few details helps me provide more relevant information. This is optional but recommended.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto px-6 pb-6">
              {isProfileLoading ? (
                 <div className="flex items-center justify-center py-6 text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading profile info...
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
                      <Label htmlFor="weeksPregnant">Weeks Pregnant (approx)</Label>
                      <Input id="weeksPregnant" type="number" placeholder="e.g., 16" value={weeksPregnant} onChange={(e) => setWeeksPregnant(e.target.value)} min="0" max="45" />
                       {userProfile?.monthOfConception && !weeksPregnant && (
                           <p className="text-xs text-gray-500">We'll estimate weeks from your profile.</p>
                       )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="conditions">Pre-existing Conditions (optional)</Label>
                    <Input id="conditions" placeholder="e.g., Diabetes, Hypertension" value={preExistingConditions} onChange={(e) => setPreExistingConditions(e.target.value)} />
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
                disabled={isStartingChat || isProfileLoading}
              >
                {isStartingChat ? ( <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting Chat...</> ) : ( "Start Chat" )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Chat Interface */}
        {!showPreChat && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <Card className="flex-1 flex flex-col overflow-hidden border-momcare-primary/20">
              {/* Message Display Area */}
              <CardContent ref={messagesEndRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {messages.map((message, index) => (
                  <div
                    // Use a more stable key if possible, e.g., message ID if available
                    key={`${message.role}-${index}-${message.parts[0].text.substring(0, 10)}`}
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

                {/* Display streaming response */}
                {streamingResponse && (
                  <div className="flex justify-start pr-10">
                    <div className="max-w-[85%] px-4 py-2.5 rounded-xl shadow-sm bg-gray-100 text-gray-900 rounded-tl-none">
                      <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {streamingResponse}
                        <span className="inline-block w-1 h-4 bg-gray-600 animate-pulse ml-1 align-middle"></span> {/* Blinking cursor */}
                      </p>
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && !streamingResponse && (
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

              {/* Input Area */}
              <CardFooter className="border-t p-4 bg-white">
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
                    onClick={handleSendMessage}
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
    </MainLayout>
  );
};

export default ChatPage;