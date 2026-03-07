import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Search,
  Send,
  Bot,
  Clock,
  CheckCheck,
  Check,
  X,
  Image as ImageIcon,
  Paperclip,
  MessageSquare,
  User,
} from "lucide-react";

interface Conversation {
  id: string;
  org_id: string;
  contact_id: string;
  phone_number: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  status: string;
  ai_enabled: boolean;
  contacts: { name: string | null; phone_number: string } | null;
}

interface Message {
  id: string;
  direction: string;
  content: string | null;
  media_url: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function replyWindowRemaining(lastInboundAt: string | null): { expired: boolean; label: string } {
  if (!lastInboundAt) return { expired: true, label: "No inbound" };
  const diff = 24 * 60 * 60 * 1000 - (Date.now() - new Date(lastInboundAt).getTime());
  if (diff <= 0) return { expired: true, label: "Window expired" };
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return { expired: false, label: `${hrs}h ${mins}m left` };
}

export default function Communications() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConvo = conversations.find((c) => c.id === activeId) || null;
  const window24h = replyWindowRemaining(activeConvo?.last_inbound_at || null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(name, phone_number)")
      .eq("org_id", currentOrg.id)
      .order("last_message_at", { ascending: false });
    setConversations((data as any) ?? []);
    setLoadingConvos(false);
  }, [currentOrg]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime for conversations
  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase
      .channel(`convos-${currentOrg.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "conversations",
        filter: `org_id=eq.${currentOrg.id}`,
      }, () => fetchConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg, fetchConversations]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async () => {
    if (!activeId) return;
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("messages")
      .select("id, direction, content, media_url, status, sent_at, created_at")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data as any) ?? []);
    setLoadingMsgs(false);
  }, [activeId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Mark as read when opening a conversation
  useEffect(() => {
    if (!activeId || !activeConvo || activeConvo.unread_count === 0) return;
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId).then();
  }, [activeId]);

  // Realtime for messages in active conversation
  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`msgs-${activeId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${activeId}`,
      }, () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, fetchMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendReply = async () => {
    if (!replyText.trim() || !activeId || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reply", {
        body: { conversation_id: activeId, content: replyText.trim() },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ variant: "destructive", title: "Reply failed", description: data.error });
      } else {
        setReplyText("");
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSending(false);
    }
  };

  const toggleAi = async (convoId: string, enabled: boolean) => {
    await supabase.from("conversations").update({ ai_enabled: enabled }).eq("id", convoId);
    setConversations((prev) =>
      prev.map((c) => (c.id === convoId ? { ...c, ai_enabled: enabled } : c))
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  const filteredConvos = conversations.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (c.contacts?.name?.toLowerCase().includes(s) ?? false) ||
      c.phone_number.includes(s) ||
      (c.last_message_preview?.toLowerCase().includes(s) ?? false)
    );
  });

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-lg border border-border bg-background">
        {/* ── Left: Conversation List ── */}
        <div className="flex w-80 flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConvos ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
            ) : filteredConvos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
              </div>
            ) : (
              filteredConvos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent",
                    activeId === c.id && "bg-accent"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.contacts?.name || c.phone_number}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {c.last_message_at ? timeAgo(c.last_message_at) : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {c.last_message_preview || "No messages"}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        {c.ai_enabled && <Bot className="h-3 w-3 text-primary" />}
                        {c.unread_count > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right: Chat Area ── */}
        {activeConvo ? (
          <div className="flex flex-1 flex-col">
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {activeConvo.contacts?.name || activeConvo.phone_number}
                  </p>
                  <p className="text-xs text-muted-foreground">{activeConvo.phone_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={cn("text-xs", window24h.expired ? "text-destructive" : "text-muted-foreground")}>
                    {window24h.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <Switch
                    checked={activeConvo.ai_enabled}
                    onCheckedChange={(v) => toggleAi(activeConvo.id, v)}
                  />
                  <span className="text-xs text-muted-foreground">AI</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
              {loadingMsgs ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No messages in this conversation.</p>
              ) : (
                <div className="space-y-2">
                  {messages.map((m) => {
                    const isInbound = m.direction === "inbound";
                    return (
                      <div key={m.id} className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
                        <div
                          className={cn(
                            "max-w-[70%] rounded-lg px-3 py-2 shadow-sm",
                            isInbound
                              ? "rounded-tl-none bg-background border border-border"
                              : "rounded-tr-none bg-primary text-primary-foreground"
                          )}
                        >
                          {m.media_url && (
                            <img
                              src={m.media_url}
                              alt=""
                              className="mb-1.5 max-h-48 rounded object-cover"
                            />
                          )}
                          {m.content && (
                            <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                          )}
                          <div className={cn("mt-1 flex items-center justify-end gap-1", isInbound ? "text-muted-foreground" : "text-primary-foreground/70")}>
                            <span className="text-[10px]">
                              {m.sent_at
                                ? new Date(m.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {!isInbound && (
                              m.status === "read" ? (
                                <CheckCheck className="h-3 w-3 text-blue-400" />
                              ) : m.status === "delivered" ? (
                                <CheckCheck className="h-3 w-3" />
                              ) : m.status === "sent" ? (
                                <Check className="h-3 w-3" />
                              ) : m.status === "failed" ? (
                                <X className="h-3 w-3 text-destructive" />
                              ) : (
                                <Clock className="h-3 w-3" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Reply Composer */}
            <div className="border-t border-border p-3">
              {window24h.expired ? (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2">
                  <Clock className="h-4 w-4 text-destructive" />
                  <p className="text-sm text-destructive">
                    24-hour reply window has expired. Use a template message to re-engage.
                  </p>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="min-h-[40px] max-h-[120px] resize-none"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    onClick={sendReply}
                    disabled={!replyText.trim() || sending}
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                Select a conversation to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
