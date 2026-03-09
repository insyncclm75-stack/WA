import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Connection,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Save,
  ArrowLeft,
  Play,
  Pause,
  MessageSquare,
  MousePointerClick,
  List,
  Clock,
  GitBranch,
  Variable,
  UserCheck,
  XCircle,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

// ── Custom Node Components ──

function TriggerNode({ data }: NodeProps) {
  return (
    <div className="rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 shadow-md dark:bg-green-950/40">
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <Zap className="h-4 w-4" />
        <span className="text-sm font-bold">Trigger</span>
      </div>
      <p className="mt-1 text-xs text-green-600 dark:text-green-500">
        {data.trigger_type === "keyword" ? `Keyword: "${data.trigger_value || "..."}"` : data.trigger_type === "first_message" ? "First message" : "All messages"}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500" />
    </div>
  );
}

function SendMessageNode({ data }: NodeProps) {
  return (
    <div className="min-w-[180px] rounded-xl border-2 border-blue-500 bg-blue-50 px-4 py-3 shadow-md dark:bg-blue-950/40">
      <Handle type="target" position={Position.Top} className="!bg-blue-500" />
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-bold">Send Message</span>
      </div>
      <p className="mt-1 max-w-[200px] truncate text-xs text-blue-600 dark:text-blue-500">
        {(data.message as string) || "Configure message..."}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
    </div>
  );
}

function SendButtonsNode({ data }: NodeProps) {
  const buttons = (data.buttons as any[]) || [];
  return (
    <div className="min-w-[180px] rounded-xl border-2 border-purple-500 bg-purple-50 px-4 py-3 shadow-md dark:bg-purple-950/40">
      <Handle type="target" position={Position.Top} className="!bg-purple-500" />
      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
        <MousePointerClick className="h-4 w-4" />
        <span className="text-sm font-bold">Buttons</span>
      </div>
      <p className="mt-1 max-w-[200px] truncate text-xs text-purple-600 dark:text-purple-500">
        {(data.body as string) || "Configure..."}
      </p>
      {buttons.length > 0 && (
        <div className="mt-2 space-y-1">
          {buttons.map((b: any, i: number) => (
            <div key={i} className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              {b.title || `Button ${i + 1}`}
            </div>
          ))}
        </div>
      )}
      {buttons.map((_: any, i: number) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={`btn_${i}`}
          className="!bg-purple-500"
          style={{ left: `${((i + 1) / (buttons.length + 1)) * 100}%` }}
        />
      ))}
      <Handle type="source" position={Position.Bottom} id="default" className="!bg-purple-300" style={{ left: "90%" }} />
    </div>
  );
}

function SendListNode({ data }: NodeProps) {
  return (
    <div className="min-w-[180px] rounded-xl border-2 border-indigo-500 bg-indigo-50 px-4 py-3 shadow-md dark:bg-indigo-950/40">
      <Handle type="target" position={Position.Top} className="!bg-indigo-500" />
      <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
        <List className="h-4 w-4" />
        <span className="text-sm font-bold">List Menu</span>
      </div>
      <p className="mt-1 max-w-[200px] truncate text-xs text-indigo-600 dark:text-indigo-500">
        {(data.body as string) || "Configure list..."}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500" />
    </div>
  );
}

function WaitReplyNode(_props: NodeProps) {
  return (
    <div className="rounded-xl border-2 border-yellow-500 bg-yellow-50 px-4 py-3 shadow-md dark:bg-yellow-950/40">
      <Handle type="target" position={Position.Top} className="!bg-yellow-500" />
      <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
        <Clock className="h-4 w-4" />
        <span className="text-sm font-bold">Wait for Reply</span>
      </div>
      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">Pauses until user responds</p>
      <Handle type="source" position={Position.Bottom} className="!bg-yellow-500" />
    </div>
  );
}

function ConditionNode({ data }: NodeProps) {
  return (
    <div className="min-w-[180px] rounded-xl border-2 border-orange-500 bg-orange-50 px-4 py-3 shadow-md dark:bg-orange-950/40">
      <Handle type="target" position={Position.Top} className="!bg-orange-500" />
      <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
        <GitBranch className="h-4 w-4" />
        <span className="text-sm font-bold">Condition</span>
      </div>
      <p className="mt-1 text-xs text-orange-600 dark:text-orange-500">
        {data.field ? `${data.field} ${data.operator} ${data.value || ""}` : "Configure..."}
      </p>
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-green-500" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500" style={{ left: "70%" }} />
    </div>
  );
}

function SetVariableNode({ data }: NodeProps) {
  return (
    <div className="rounded-xl border-2 border-teal-500 bg-teal-50 px-4 py-3 shadow-md dark:bg-teal-950/40">
      <Handle type="target" position={Position.Top} className="!bg-teal-500" />
      <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
        <Variable className="h-4 w-4" />
        <span className="text-sm font-bold">Set Variable</span>
      </div>
      <p className="mt-1 text-xs text-teal-600 dark:text-teal-500">
        {data.variable_name ? `${data.variable_name} = ${data.variable_value}` : "Configure..."}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-teal-500" />
    </div>
  );
}

function AssignAgentNode({ data }: NodeProps) {
  return (
    <div className="rounded-xl border-2 border-cyan-500 bg-cyan-50 px-4 py-3 shadow-md dark:bg-cyan-950/40">
      <Handle type="target" position={Position.Top} className="!bg-cyan-500" />
      <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400">
        <UserCheck className="h-4 w-4" />
        <span className="text-sm font-bold">Assign Agent</span>
      </div>
      <p className="mt-1 text-xs text-cyan-600 dark:text-cyan-500">
        {data.agent_name || "Select agent..."}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500" />
    </div>
  );
}

function CloseConversationNode(_props: NodeProps) {
  return (
    <div className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 shadow-md dark:bg-red-950/40">
      <Handle type="target" position={Position.Top} className="!bg-red-500" />
      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
        <XCircle className="h-4 w-4" />
        <span className="text-sm font-bold">Close Conversation</span>
      </div>
    </div>
  );
}

const nodeTypes = {
  trigger: TriggerNode,
  send_message: SendMessageNode,
  send_buttons: SendButtonsNode,
  send_list: SendListNode,
  wait_reply: WaitReplyNode,
  condition: ConditionNode,
  set_variable: SetVariableNode,
  assign_agent: AssignAgentNode,
  close_conversation: CloseConversationNode,
};

const defaultEdgeOptions = {
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
};

// ── Node palette items ──
const nodePalette = [
  { type: "send_message", label: "Send Message", icon: MessageSquare, color: "blue" },
  { type: "send_buttons", label: "Buttons", icon: MousePointerClick, color: "purple" },
  { type: "send_list", label: "List Menu", icon: List, color: "indigo" },
  { type: "wait_reply", label: "Wait Reply", icon: Clock, color: "yellow" },
  { type: "condition", label: "Condition", icon: GitBranch, color: "orange" },
  { type: "set_variable", label: "Set Variable", icon: Variable, color: "teal" },
  { type: "assign_agent", label: "Assign Agent", icon: UserCheck, color: "cyan" },
  { type: "close_conversation", label: "Close", icon: XCircle, color: "red" },
];

export default function ChatbotBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const [flowName, setFlowName] = useState("New Chatbot");
  const [flowDescription, setFlowDescription] = useState("");
  const [triggerType, setTriggerType] = useState("keyword");
  const [triggerValue, setTriggerValue] = useState("");
  const [flowStatus, setFlowStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [members, setMembers] = useState<{ id: string; email: string }[]>([]);

  const initialNodes: Node[] = [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 250, y: 50 },
      data: { trigger_type: "keyword", trigger_value: "" },
    },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load existing flow
  useEffect(() => {
    if (!id || id === "new") return;
    (async () => {
      const { data: flow } = await supabase
        .from("chatbot_flows")
        .select("*")
        .eq("id", id)
        .single();
      if (flow) {
        setFlowName(flow.name);
        setFlowDescription(flow.description || "");
        setTriggerType(flow.trigger_type);
        setTriggerValue(flow.trigger_value || "");
        setFlowStatus(flow.status);
        const loadedNodes = (flow.nodes as any[]) || [];
        const loadedEdges = (flow.edges as any[]) || [];
        if (loadedNodes.length > 0) setNodes(loadedNodes);
        if (loadedEdges.length > 0) setEdges(loadedEdges);
      }
    })();
  }, [id, setNodes, setEdges]);

  // Load team members
  useEffect(() => {
    if (!currentOrg) return;
    (async () => {
      const { data } = await supabase
        .from("org_memberships")
        .select("user_id, profiles:user_id(email)")
        .eq("org_id", currentOrg.id);
      if (data) {
        setMembers(
          data.map((m: any) => ({
            id: m.user_id,
            email: m.profiles?.email || m.user_id,
          }))
        );
      }
    })();
  }, [currentOrg]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, ...defaultEdgeOptions }, eds));
    },
    [setEdges]
  );

  const addNode = (type: string) => {
    const newId = `${type}-${Date.now()}`;
    const defaultData: Record<string, any> = {};

    if (type === "send_message") defaultData.message = "";
    if (type === "send_buttons") {
      defaultData.body = "";
      defaultData.buttons = [{ title: "Option 1" }, { title: "Option 2" }];
    }
    if (type === "send_list") {
      defaultData.body = "";
      defaultData.button_text = "Choose";
      defaultData.sections = [{ title: "Options", rows: [{ title: "Item 1", description: "" }] }];
    }
    if (type === "condition") {
      defaultData.field = "last_message";
      defaultData.operator = "contains";
      defaultData.value = "";
    }
    if (type === "set_variable") {
      defaultData.variable_name = "";
      defaultData.variable_value = "";
    }
    if (type === "assign_agent") {
      defaultData.agent_id = "";
      defaultData.agent_name = "";
    }

    const newNode: Node = {
      id: newId,
      type,
      position: { x: 250, y: (nodes.length + 1) * 120 },
      data: defaultData,
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const deleteNode = (nodeId: string) => {
    if (nodeId.startsWith("trigger")) return; // Can't delete trigger
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setEditingNode(null);
  };

  const updateNodeData = (nodeId: string, newData: Record<string, any>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    );
  };

  const onNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
    setEditingNode(node);
  };

  const saveFlow = async () => {
    if (!currentOrg || !user) return;
    setSaving(true);

    // Update trigger node data
    setNodes((nds) =>
      nds.map((n) =>
        n.type === "trigger"
          ? { ...n, data: { ...n.data, trigger_type: triggerType, trigger_value: triggerValue } }
          : n
      )
    );

    const flowData = {
      org_id: currentOrg.id,
      name: flowName,
      description: flowDescription || null,
      trigger_type: triggerType,
      trigger_value: triggerValue || null,
      status: flowStatus,
      nodes,
      edges,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    try {
      if (id && id !== "new") {
        const { error } = await supabase
          .from("chatbot_flows")
          .update(flowData)
          .eq("id", id);
        if (error) throw error;
        toast({ title: "Flow saved" });
      } else {
        const { data: newFlow, error } = await supabase
          .from("chatbot_flows")
          .insert(flowData)
          .select("id")
          .single();
        if (error) throw error;
        toast({ title: "Flow created" });
        navigate(`/chatbot/${newFlow.id}`, { replace: true });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    const newStatus = flowStatus === "active" ? "paused" : "active";
    setFlowStatus(newStatus);
    if (id && id !== "new") {
      await supabase
        .from("chatbot_flows")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      toast({ title: `Flow ${newStatus}` });
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/chatbot")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Input
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          className="h-9 max-w-xs text-lg font-semibold"
        />
        <Badge
          className={cn(
            "text-xs",
            flowStatus === "active"
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : flowStatus === "paused"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-muted text-muted-foreground"
          )}
        >
          {flowStatus}
        </Badge>
        <div className="flex-1" />
        {id !== "new" && (
          <Button variant="outline" size="sm" onClick={toggleStatus}>
            {flowStatus === "active" ? <Pause className="mr-1 h-3 w-3" /> : <Play className="mr-1 h-3 w-3" />}
            {flowStatus === "active" ? "Pause" : "Activate"}
          </Button>
        )}
        <Button onClick={saveFlow} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Trigger Config */}
      <div className="mb-4 flex items-end gap-4 rounded-lg border border-border bg-muted/30 p-3">
        <div>
          <Label className="text-xs">Trigger Type</Label>
          <Select value={triggerType} onValueChange={setTriggerType}>
            <SelectTrigger className="mt-1 h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Keyword</SelectItem>
              <SelectItem value="first_message">First Message</SelectItem>
              <SelectItem value="all_messages">All Messages</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {triggerType === "keyword" && (
          <div>
            <Label className="text-xs">Keywords (comma-separated)</Label>
            <Input
              value={triggerValue}
              onChange={(e) => setTriggerValue(e.target.value)}
              placeholder="hi, hello, start"
              className="mt-1 h-8 w-56 text-xs"
            />
          </div>
        )}
        <div className="flex-1">
          <Label className="text-xs">Description</Label>
          <Input
            value={flowDescription}
            onChange={(e) => setFlowDescription(e.target.value)}
            placeholder="Optional description..."
            className="mt-1 h-8 text-xs"
          />
        </div>
      </div>

      {/* Canvas + Palette */}
      <div className="flex gap-4" style={{ height: "calc(100vh - 280px)" }}>
        {/* Node Palette */}
        <div className="w-48 space-y-2 rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-semibold text-muted-foreground">Add Nodes</p>
          {nodePalette.map((item) => (
            <button
              key={item.type}
              className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent"
              onClick={() => addNode(item.type)}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        {/* React Flow Canvas */}
        <div className="flex-1 rounded-lg border border-border" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            className="bg-background"
          >
            <Background gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  trigger: "#22c55e",
                  send_message: "#3b82f6",
                  send_buttons: "#a855f7",
                  send_list: "#6366f1",
                  wait_reply: "#eab308",
                  condition: "#f97316",
                  set_variable: "#14b8a6",
                  assign_agent: "#06b6d4",
                  close_conversation: "#ef4444",
                };
                return colors[node.type || ""] || "#888";
              }}
            />
          </ReactFlow>
        </div>
      </div>

      {/* Node Editor Dialog */}
      <Dialog open={!!editingNode} onOpenChange={(open) => !open && setEditingNode(null)}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Edit Node
              {editingNode && !editingNode.id.startsWith("trigger") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteNode(editingNode.id)}
                  className="text-destructive"
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {editingNode && (
            <div className="space-y-4 pt-2">
              {/* Send Message Editor */}
              {editingNode.type === "send_message" && (
                <div>
                  <Label>Message</Label>
                  <Textarea
                    value={(editingNode.data.message as string) || ""}
                    onChange={(e) => {
                      updateNodeData(editingNode.id, { message: e.target.value });
                      setEditingNode({ ...editingNode, data: { ...editingNode.data, message: e.target.value } });
                    }}
                    rows={4}
                    placeholder="Hello {{name}}! How can I help?"
                    className="mt-1"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Use {"{{name}}"}, {"{{phone}}"}, or custom {"{{variable}}"} placeholders
                  </p>
                  <div className="mt-3">
                    <Label>Media URL (optional)</Label>
                    <Input
                      value={(editingNode.data.media_url as string) || ""}
                      onChange={(e) => {
                        updateNodeData(editingNode.id, { media_url: e.target.value });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, media_url: e.target.value } });
                      }}
                      placeholder="https://..."
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Buttons Editor */}
              {editingNode.type === "send_buttons" && (
                <div className="space-y-3">
                  <div>
                    <Label>Body Text</Label>
                    <Textarea
                      value={(editingNode.data.body as string) || ""}
                      onChange={(e) => {
                        updateNodeData(editingNode.id, { body: e.target.value });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, body: e.target.value } });
                      }}
                      rows={2}
                      placeholder="Please choose an option:"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Buttons (max 3)</Label>
                    {((editingNode.data.buttons as any[]) || []).map((btn: any, i: number) => (
                      <div key={i} className="mt-1 flex items-center gap-2">
                        <Input
                          value={btn.title || ""}
                          onChange={(e) => {
                            const newButtons = [...((editingNode.data.buttons as any[]) || [])];
                            newButtons[i] = { ...newButtons[i], title: e.target.value.substring(0, 20) };
                            updateNodeData(editingNode.id, { buttons: newButtons });
                            setEditingNode({ ...editingNode, data: { ...editingNode.data, buttons: newButtons } });
                          }}
                          maxLength={20}
                          placeholder={`Button ${i + 1}`}
                          className="h-8 text-xs"
                        />
                        {((editingNode.data.buttons as any[]) || []).length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              const newButtons = ((editingNode.data.buttons as any[]) || []).filter((_: any, j: number) => j !== i);
                              updateNodeData(editingNode.id, { buttons: newButtons });
                              setEditingNode({ ...editingNode, data: { ...editingNode.data, buttons: newButtons } });
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {((editingNode.data.buttons as any[]) || []).length < 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => {
                          const newButtons = [...((editingNode.data.buttons as any[]) || []), { title: "" }];
                          updateNodeData(editingNode.id, { buttons: newButtons });
                          setEditingNode({ ...editingNode, data: { ...editingNode.data, buttons: newButtons } });
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add Button
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* List Editor */}
              {editingNode.type === "send_list" && (
                <div className="space-y-3">
                  <div>
                    <Label>Body Text</Label>
                    <Textarea
                      value={(editingNode.data.body as string) || ""}
                      onChange={(e) => {
                        updateNodeData(editingNode.id, { body: e.target.value });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, body: e.target.value } });
                      }}
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Button Text</Label>
                    <Input
                      value={(editingNode.data.button_text as string) || "Choose"}
                      onChange={(e) => {
                        updateNodeData(editingNode.id, { button_text: e.target.value });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, button_text: e.target.value } });
                      }}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label>List Items</Label>
                    {((editingNode.data.sections as any[]) || []).map((sec: any, si: number) => (
                      <div key={si} className="mt-2 rounded border border-border p-2">
                        <Input
                          value={sec.title || ""}
                          onChange={(e) => {
                            const newSections = [...((editingNode.data.sections as any[]) || [])];
                            newSections[si] = { ...newSections[si], title: e.target.value };
                            updateNodeData(editingNode.id, { sections: newSections });
                            setEditingNode({ ...editingNode, data: { ...editingNode.data, sections: newSections } });
                          }}
                          placeholder="Section title"
                          className="mb-2 h-7 text-xs"
                        />
                        {(sec.rows || []).map((row: any, ri: number) => (
                          <div key={ri} className="mb-1 grid grid-cols-2 gap-1">
                            <Input
                              value={row.title || ""}
                              onChange={(e) => {
                                const newSections = [...((editingNode.data.sections as any[]) || [])];
                                const newRows = [...(newSections[si].rows || [])];
                                newRows[ri] = { ...newRows[ri], title: e.target.value.substring(0, 24) };
                                newSections[si] = { ...newSections[si], rows: newRows };
                                updateNodeData(editingNode.id, { sections: newSections });
                                setEditingNode({ ...editingNode, data: { ...editingNode.data, sections: newSections } });
                              }}
                              placeholder="Item title"
                              className="h-7 text-[11px]"
                            />
                            <Input
                              value={row.description || ""}
                              onChange={(e) => {
                                const newSections = [...((editingNode.data.sections as any[]) || [])];
                                const newRows = [...(newSections[si].rows || [])];
                                newRows[ri] = { ...newRows[ri], description: e.target.value };
                                newSections[si] = { ...newSections[si], rows: newRows };
                                updateNodeData(editingNode.id, { sections: newSections });
                                setEditingNode({ ...editingNode, data: { ...editingNode.data, sections: newSections } });
                              }}
                              placeholder="Description"
                              className="h-7 text-[11px]"
                            />
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => {
                            const newSections = [...((editingNode.data.sections as any[]) || [])];
                            newSections[si] = {
                              ...newSections[si],
                              rows: [...(newSections[si].rows || []), { title: "", description: "" }],
                            };
                            updateNodeData(editingNode.id, { sections: newSections });
                            setEditingNode({ ...editingNode, data: { ...editingNode.data, sections: newSections } });
                          }}
                        >
                          <Plus className="mr-1 h-2.5 w-2.5" /> Add Item
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Condition Editor */}
              {editingNode.type === "condition" && (
                <div className="space-y-3">
                  <div>
                    <Label>Field</Label>
                    <Select
                      value={(editingNode.data.field as string) || "last_message"}
                      onValueChange={(v) => {
                        updateNodeData(editingNode.id, { field: v });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, field: v } });
                      }}
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="last_message">Last Message</SelectItem>
                        <SelectItem value="contact_name">Contact Name</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Operator</Label>
                    <Select
                      value={(editingNode.data.operator as string) || "contains"}
                      onValueChange={(v) => {
                        updateNodeData(editingNode.id, { operator: v });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, operator: v } });
                      }}
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="starts_with">Starts With</SelectItem>
                        <SelectItem value="not_empty">Not Empty</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Value</Label>
                    <Input
                      value={(editingNode.data.value as string) || ""}
                      onChange={(e) => {
                        updateNodeData(editingNode.id, { value: e.target.value });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, value: e.target.value } });
                      }}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Connect the green handle (true) and red handle (false) to different nodes
                  </p>
                </div>
              )}

              {/* Set Variable Editor */}
              {editingNode.type === "set_variable" && (
                <div className="space-y-3">
                  <div>
                    <Label>Variable Name</Label>
                    <Input
                      value={(editingNode.data.variable_name as string) || ""}
                      onChange={(e) => {
                        updateNodeData(editingNode.id, { variable_name: e.target.value });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, variable_name: e.target.value } });
                      }}
                      placeholder="e.g., user_choice"
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label>Value</Label>
                    <Input
                      value={(editingNode.data.variable_value as string) || ""}
                      onChange={(e) => {
                        updateNodeData(editingNode.id, { variable_value: e.target.value });
                        setEditingNode({ ...editingNode, data: { ...editingNode.data, variable_value: e.target.value } });
                      }}
                      placeholder="{{last_message}} or static text"
                      className="mt-1 h-8 text-xs"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Use {"{{last_message}}"} to capture user input
                    </p>
                  </div>
                </div>
              )}

              {/* Assign Agent Editor */}
              {editingNode.type === "assign_agent" && (
                <div>
                  <Label>Agent</Label>
                  <Select
                    value={(editingNode.data.agent_id as string) || ""}
                    onValueChange={(v) => {
                      const member = members.find((m) => m.id === v);
                      updateNodeData(editingNode.id, { agent_id: v, agent_name: member?.email || v });
                      setEditingNode({
                        ...editingNode,
                        data: { ...editingNode.data, agent_id: v, agent_name: member?.email || v },
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
