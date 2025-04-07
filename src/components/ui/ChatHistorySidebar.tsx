// src/components/chat/ChatHistorySidebar.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { getChatSessionsList, ChatSessionInfo } from '@/lib/appwrite'; // Adjust path
import { useAuthStore } from '@/store/authStore'; // Adjust path
import { ScrollArea } from '@/components/ui/scroll-area'; // Adjust path
import { Button } from '@/components/ui/button'; // Adjust path
import { Loader2, MessageSquareText, ServerCrash } from 'lucide-react';
import { cn } from '@/lib/utils'; // Adjust path (for conditional classes)
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"; // Adjust path

interface ChatHistorySidebarProps {
  onSelectSession: (sessionId: string) => void;
  currentSessionId: string | null;
  className?: string; // Allow passing custom classes
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  onSelectSession,
  currentSessionId,
  className,
}) => {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!user?.$id) {
      setError("User not logged in.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const sessionList = await getChatSessionsList(user.$id, 200); // Scan last 200 messages
      setSessions(sessionList);
    } catch (err) {
      console.error("Failed to fetch chat sessions:", err);
      setError("Could not load chat history.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.$id]);

  useEffect(() => {
    fetchSessions();
    // Optional: Add polling or a refresh button if needed
  }, [fetchSessions]);

  const handleSessionClick = (sessionId: string) => {
    if (sessionId !== currentSessionId) {
      onSelectSession(sessionId);
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className={cn("h-full w-64 border-r bg-gray-50/50 flex flex-col", className)}>
        <h2 className="text-lg font-semibold p-3 border-b text-center text-momcare-primary shrink-0">
          Chat History
        </h2>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading && (
              <div className="flex justify-center items-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                <span className="ml-2 text-sm text-gray-500">Loading...</span>
              </div>
            )}
            {error && !isLoading && (
              <div className="flex flex-col items-center text-center py-4 px-2 text-red-600">
                 <ServerCrash className="h-6 w-6 mb-1" />
                 <span className="text-sm font-medium">Error Loading History</span>
                 <p className="text-xs mt-1">{error}</p>
                 <Button variant="outline" size="sm" className="mt-3" onClick={fetchSessions}>
                    Retry
                 </Button>
              </div>
            )}
            {!isLoading && !error && sessions.length === 0 && (
              <div className="text-center py-4 px-2 text-gray-500">
                <MessageSquareText className="h-6 w-6 mx-auto mb-1" />
                <p className="text-sm">No chat history found.</p>
                <p className="text-xs mt-1">Start a new chat to see it here.</p>
              </div>
            )}
            {!isLoading && !error && sessions.length > 0 && (
              sessions.map((session) => (
                <Tooltip key={session.sessionId}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={currentSessionId === session.sessionId ? 'secondary' : 'ghost'}
                      className={cn(
                        "w-full justify-start h-auto py-2 px-3 text-left",
                        currentSessionId === session.sessionId && "bg-momcare-primary/10 text-momcare-primary"
                      )}
                      onClick={() => handleSessionClick(session.sessionId)}
                      disabled={currentSessionId === session.sessionId} // Disable clicking the active one
                    >
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate" title={session.preview}>
                          {session.preview || "Chat Session"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {session.relativeDate}
                        </span>
                      </div>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Session ID: ...{session.sessionId.slice(-6)}</p>
                    <p>Started: {new Date(session.firstMessageTimestamp).toLocaleString()}</p>
                    <p>Messages: {session.messageCount}</p>
                  </TooltipContent>
                </Tooltip>
              ))
            )}
          </div>
        </ScrollArea>
        {/* Optional Footer for Refresh Button */}
        {/* <div className="p-2 border-t shrink-0">
            <Button variant="outline" size="sm" className="w-full" onClick={fetchSessions} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
            </Button>
        </div> */}
      </div>
    </TooltipProvider>
  );
};

export default ChatHistorySidebar;