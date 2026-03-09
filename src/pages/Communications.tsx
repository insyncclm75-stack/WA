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
import { AiInsights } from "@/components/AiInsights";
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
  MousePointerClick,
  List,
  Plus,
  Trash2,
  Type,
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
  message_type?: string;
  interactive_data?: any;
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

  // Interactive message state
  const [replyMode, setReplyMode] = useState<"text" | "buttons" | "list">("text");
  const [replyButtons, setReplyButtons] = useState<{ id: string; title: string }[]>([
    { id: "btn_1", title: "" },
  ]);
  const [listData, setListData] = useState({
    buttonText: "Select",
    sections: [{ title: "", rows: [{ id: "row_1", title: "", description: "" }] }],
  });

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
      .select("id, direction, content, media_url, message_type, interactive_data, status, sent_at, created_at")
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
    if (!activeId || sending) return;

    let body: any;
    if (replyMode === "buttons") {
      const validButtons = replyButtons.filter((b) => b.title.trim());
      if (validButtons.length === 0 || !replyText.trim()) return;
      body = {
        conversation_id: activeId,
        content: replyText.trim(),
        message_type: "interactive_buttons",
        interactive_data: { buttons: validButtons },
      };
    } else if (replyMode === "list") {
      const validSections = listData.sections
        .map((s) => ({ ...s, rows: s.rows.filter((r) => r.title.trim()) }))
        .filter((s) => s.rows.length > 0);
      if (validSections.length === 0 || !replyText.trim()) return;
      body = {
        conversation_id: activeId,
        content: replyText.trim(),
        message_type: "interactive_list",
        interactive_data: { button_text: listData.buttonText || "Select", sections: validSections },
      };
    } else {
      if (!replyText.trim()) return;
      body = { conversation_id: activeId, content: replyText.trim() };
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reply", { body });
      if (error) throw error;
      if (data?.error) {
        toast({ variant: "destructive", title: "Reply failed", description: data.error });
      } else {
        setReplyText("");
        setReplyMode("text");
        setReplyButtons([{ id: "btn_1", title: "" }]);
        setListData({ buttonText: "Select", sections: [{ title: "", rows: [{ id: "row_1", title: "", description: "" }] }] });
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
                          {/* Outbound interactive buttons */}
                          {m.message_type === "interactive_buttons" && m.interactive_data?.buttons && (
                            <div className="mt-2 space-y-1 border-t border-current/10 pt-2">
                              {(m.interactive_data.buttons as any[]).map((btn: any, i: number) => (
                                <div key={i} className="rounded border border-current/20 px-2 py-1 text-center text-xs font-medium">
                                  {btn.title}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Outbound interactive list */}
                          {m.message_type === "interactive_list" && m.interactive_data && (
                            <div className="mt-2 border-t border-current/10 pt-2">
                              <div className="rounded border border-current/20 px-2 py-1 text-center text-xs font-medium flex items-center justify-center gap-1">
                                <List className="h-3 w-3" />
                                {(m.interactive_data as any).button_text || "Select"}
                              </div>
                            </div>
                          )}
                          {/* Inbound button response */}
                          {m.message_type === "button_response" && m.interactive_data && (
                            <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                              <MousePointerClick className="h-3 w-3" />
                              Tapped: {(m.interactive_data as any).button_text}
                            </div>
                          )}
                          {/* Inbound list response */}
                          {m.message_type === "list_response" && m.interactive_data && (
                            <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                              <List className="h-3 w-3" />
                              Selected: {(m.interactive_data as any).list_item_title}
                            </div>
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
                <div className="space-y-2">
                  {/* Mode selector */}
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={replyMode === "text" ? "default" : "ghost"}
                      onClick={() => setReplyMode("text")}
                      className="h-7 px-2 text-xs"
                    >
                      <Type className="mr-1 h-3 w-3" />
                      Text
                    </Button>
                    <Button
                      size="sm"
                      variant={replyMode === "buttons" ? "default" : "ghost"}
                      onClick={() => setReplyMode("buttons")}
                      className="h-7 px-2 text-xs"
                    >
                      <MousePointerClick className="mr-1 h-3 w-3" />
                      Buttons
                    </Button>
                    <Button
                      size="sm"
                      variant={replyMode === "list" ? "default" : "ghost"}
                      onClick={() => setReplyMode("list")}
                      className="h-7 px-2 text-xs"
                    >
                      <List className="mr-1 h-3 w-3" />
                      List
                    </Button>
                  </div>

                  {/* Message body (always shown) */}
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={replyMode === "text" ? handleKeyDown : undefined}
                      placeholder={replyMode === "text" ? "Type a message..." : "Message body..."}
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

                  {/* Buttons builder */}
                  {replyMode === "buttons" && (
                    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
                      <p className="text-xs font-medium text-muted-foreground">Reply Buttons (max 3)</p>
                      {replyButtons.map((btn, i) => (
                        <div key={btn.id} className="flex items-center gap-1.5">
                          <Input
                            value={btn.title}
                            onChange={(e) => {
                              const val = e.target.value.slice(0, 20);
                              setReplyButtons((prev) => prev.map((b, j) => (j === i ? { ...b, title: val } : b)));
                            }}
                            placeholder={`Button ${i + 1}`}
                            className="h-7 text-xs"
                          />
                          {replyButtons.length > 1 && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              onClick={() => setReplyButtons((prev) => prev.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {replyButtons.length < 3 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            setReplyButtons((prev) => [...prev, { id: `btn_${prev.length + 1}`, title: "" }])
                          }
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add Button
                        </Button>
                      )}
                    </div>
                  )}

                  {/* List builder */}
                  {replyMode === "list" && (
                    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-muted-foreground">Menu Button:</p>
                        <Input
                          value={listData.buttonText}
                          onChange={(e) => setListData((p) => ({ ...p, buttonText: e.target.value.slice(0, 20) }))}
                          className="h-7 w-32 text-xs"
                        />
                      </div>
                      {listData.sections.map((section, si) => (
                        <div key={si} className="space-y-1 rounded border border-border/50 p-1.5">
                          <Input
                            value={section.title}
                            onChange={(e) => {
                              const val = e.target.value;
                              setListData((p) => ({
                                ...p,
                                sections: p.sections.map((s, j) => (j === si ? { ...s, title: val } : s)),
                              }));
                            }}
                            placeholder="Section title (optional)"
                            className="h-7 text-xs"
                          />
                          {section.rows.map((row, ri) => (
                            <div key={row.id} className="flex items-center gap-1">
                              <Input
                                value={row.title}
                                onChange={(e) => {
                                  const val = e.target.value.slice(0, 24);
                                  setListData((p) => ({
                                    ...p,
                                    sections: p.sections.map((s, j) =>
                                      j === si
                                        ? { ...s, rows: s.rows.map((r, k) => (k === ri ? { ...r, title: val } : r)) }
                                        : s
                                    ),
                                  }));
                                }}
                                placeholder="Item title"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={row.description}
                                onChange={(e) => {
                                  const val = e.target.value.slice(0, 72);
                                  setListData((p) => ({
                                    ...p,
                                    sections: p.sections.map((s, j) =>
                                      j === si
                                        ? { ...s, rows: s.rows.map((r, k) => (k === ri ? { ...r, description: val } : r)) }
                                        : s
                                    ),
                                  }));
                                }}
                                placeholder="Description"
                                className="h-7 text-xs"
                              />
                              {section.rows.length > 1 && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() =>
                                    setListData((p) => ({
                                      ...p,
                                      sections: p.sections.map((s, j) =>
                                        j === si ? { ...s, rows: s.rows.filter((_, k) => k !== ri) } : s
                                      ),
                                    }))
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                          {section.rows.length < 10 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() =>
                                setListData((p) => ({
                                  ...p,
                                  sections: p.sections.map((s, j) =>
                                    j === si
                                      ? {
                                          ...s,
                                          rows: [
                                            ...s.rows,
                                            { id: `row_${Date.now()}`, title: "", description: "" },
                                          ],
                                        }
                                      : s
                                  ),
                                }))
                              }
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              Add Item
                            </Button>
                          )}
                        </div>
                      ))}
                      {listData.sections.length < 10 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            setListData((p) => ({
                              ...p,
                              sections: [
                                ...p.sections,
                                { title: "", rows: [{ id: `row_${Date.now()}`, title: "", description: "" }] },
                              ],
                            }))
                          }
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add Section
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
            <div className="text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                Select a conversation to start messaging
              </p>
            </div>
            {conversations.length > 0 && (
              <AiInsights type="inbox" className="w-full max-w-lg" />
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
