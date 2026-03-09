import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExotelCreds } from "../_shared/get-exotel-creds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Execute a chatbot flow for a contact.
 * Called by whatsapp-webhook when an inbound message matches a flow trigger,
 * or when a contact in an active session sends a response.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      flow_id,
      session_id,
      conversation_id,
      contact_id,
      org_id,
      inbound_message,
      inbound_interactive,
    } = await req.json();

    // ── Resume existing session or start new one ──
    let session: any;
    let flow: any;

    if (session_id) {
      // Resume session
      const { data: s } = await supabase
        .from("chatbot_sessions")
        .select("*, chatbot_flows(*)")
        .eq("id", session_id)
        .eq("status", "active")
        .single();

      if (!s) {
        return new Response(JSON.stringify({ error: "Session not found or expired" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      session = s;
      flow = s.chatbot_flows;
    } else if (flow_id) {
      // Start new session
      const { data: f } = await supabase
        .from("chatbot_flows")
        .select("*")
        .eq("id", flow_id)
        .eq("status", "active")
        .single();

      if (!f) {
        return new Response(JSON.stringify({ error: "Flow not found or inactive" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      flow = f;

      // Create session
      const nodes = flow.nodes as any[];
      const triggerNode = nodes.find((n: any) => n.type === "trigger");
      if (!triggerNode) {
        return new Response(JSON.stringify({ error: "Flow has no trigger node" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newSession } = await supabase
        .from("chatbot_sessions")
        .insert({
          flow_id: flow.id,
          contact_id,
          conversation_id,
          org_id,
          current_node_id: triggerNode.id,
          variables: {},
        })
        .select("*")
        .single();

      session = newSession;
    } else {
      return new Response(JSON.stringify({ error: "flow_id or session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nodes = flow.nodes as any[];
    const edges = flow.edges as any[];

    // Get Exotel creds
    let creds: any;
    try {
      creds = await getExotelCreds(supabase, org_id);
    } catch {
      return new Response(JSON.stringify({ error: "No WhatsApp credentials configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const exotelUrl = `https://${creds.apiKey}:${creds.apiToken}@${creds.subdomain}/v2/accounts/${creds.accountSid}/messages`;

    // Get contact phone
    const { data: contact } = await supabase
      .from("contacts")
      .select("phone_number, name")
      .eq("id", contact_id)
      .single();

    if (!contact) {
      return new Response(JSON.stringify({ error: "Contact not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Execute flow from current node ──
    let currentNodeId = session.current_node_id;
    let variables = session.variables || {};
    let actionsExecuted = 0;
    const maxActions = 20; // Safety limit

    // If we have an inbound message, find the next node from current
    if (inbound_message || inbound_interactive) {
      const nextNodeId = findNextNode(currentNodeId, edges, nodes, inbound_message, inbound_interactive);
      if (nextNodeId) {
        currentNodeId = nextNodeId;
      } else {
        // No matching path — end session
        await supabase
          .from("chatbot_sessions")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", session.id);
        return new Response(JSON.stringify({ success: true, action: "session_completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Starting fresh — move past trigger to first action node
      const nextNodeId = findNextNode(currentNodeId, edges, nodes, null, null);
      if (nextNodeId) {
        currentNodeId = nextNodeId;
      }
    }

    // Process nodes until we hit a wait-for-reply or end
    let waitingForReply = false;

    while (actionsExecuted < maxActions && !waitingForReply) {
      const node = nodes.find((n: any) => n.id === currentNodeId);
      if (!node) break;

      const nodeData = node.data || {};

      switch (node.type) {
        case "send_message": {
          const messageText = resolveVariables(nodeData.message || "", variables, contact);
          await sendWhatsAppMessage(supabase, exotelUrl, creds, {
            to: contact.phone_number,
            org_id,
            contact_id,
            conversation_id,
            text: messageText,
            media_url: nodeData.media_url || null,
          });
          actionsExecuted++;
          break;
        }

        case "send_buttons": {
          const bodyText = resolveVariables(nodeData.body || "", variables, contact);
          const buttons = (nodeData.buttons || []).slice(0, 3).map((b: any, i: number) => ({
            type: "reply",
            reply: { id: `btn_${i}`, title: (b.title || b.text || "").substring(0, 20) },
          }));

          await sendWhatsAppInteractive(supabase, exotelUrl, creds, {
            to: contact.phone_number,
            org_id,
            contact_id,
            conversation_id,
            type: "button",
            body: bodyText,
            buttons,
          });
          actionsExecuted++;
          // Wait for button response
          waitingForReply = true;
          break;
        }

        case "send_list": {
          const bodyText = resolveVariables(nodeData.body || "", variables, contact);
          const sections = (nodeData.sections || []).map((s: any) => ({
            title: s.title || "Options",
            rows: (s.rows || []).map((r: any, i: number) => ({
              id: `row_${i}`,
              title: (r.title || "").substring(0, 24),
              description: (r.description || "").substring(0, 72),
            })),
          }));

          await sendWhatsAppInteractive(supabase, exotelUrl, creds, {
            to: contact.phone_number,
            org_id,
            contact_id,
            conversation_id,
            type: "list",
            body: bodyText,
            button_text: nodeData.button_text || "Choose",
            sections,
          });
          actionsExecuted++;
          waitingForReply = true;
          break;
        }

        case "wait_reply": {
          waitingForReply = true;
          break;
        }

        case "delay": {
          // For delays, we'd need a scheduled callback. For now, just continue.
          // In production, this would schedule a pg_cron callback.
          break;
        }

        case "condition": {
          // Evaluate condition and pick the right edge
          const condField = nodeData.field || "last_message";
          const condOp = nodeData.operator || "equals";
          const condValue = nodeData.value || "";

          let fieldValue = "";
          if (condField === "last_message") fieldValue = inbound_message || "";
          else if (condField === "contact_name") fieldValue = contact.name || "";
          else fieldValue = variables[condField] || "";

          let matched = false;
          if (condOp === "equals") matched = fieldValue.toLowerCase() === condValue.toLowerCase();
          else if (condOp === "contains") matched = fieldValue.toLowerCase().includes(condValue.toLowerCase());
          else if (condOp === "starts_with") matched = fieldValue.toLowerCase().startsWith(condValue.toLowerCase());
          else if (condOp === "not_empty") matched = fieldValue.trim().length > 0;

          // Find edge based on condition result
          const matchLabel = matched ? "true" : "false";
          const condEdge = edges.find(
            (e: any) => e.source === currentNodeId && (e.sourceHandle === matchLabel || e.data?.label === matchLabel)
          );
          if (condEdge) {
            currentNodeId = condEdge.target;
            continue;
          }
          // No matching edge — end
          break;
        }

        case "set_variable": {
          const varName = nodeData.variable_name || "var";
          let varValue = nodeData.variable_value || "";
          if (varValue === "{{last_message}}") varValue = inbound_message || "";
          else if (varValue === "{{contact_name}}") varValue = contact.name || "";
          variables[varName] = varValue;
          break;
        }

        case "assign_agent": {
          // Assign conversation to a specific agent
          if (nodeData.agent_id && conversation_id) {
            await supabase
              .from("conversations")
              .update({
                assigned_to: nodeData.agent_id,
                ai_enabled: false, // Disable AI when assigning to human
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversation_id);
          }
          break;
        }

        case "close_conversation": {
          if (conversation_id) {
            await supabase
              .from("conversations")
              .update({
                status: "closed",
                resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversation_id);
          }
          // End the flow session
          await supabase
            .from("chatbot_sessions")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", session.id);
          return new Response(JSON.stringify({ success: true, action: "conversation_closed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        default:
          break;
      }

      // Move to next node (unless condition already set it)
      if (node.type !== "condition") {
        const nextId = findNextNode(currentNodeId, edges, nodes, null, null);
        if (!nextId) break;
        currentNodeId = nextId;
      }
    }

    // Update session state
    if (waitingForReply) {
      await supabase
        .from("chatbot_sessions")
        .update({
          current_node_id: currentNodeId,
          variables,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
    } else {
      // Flow completed
      await supabase
        .from("chatbot_sessions")
        .update({
          current_node_id: currentNodeId,
          variables,
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
    }

    return new Response(
      JSON.stringify({ success: true, session_id: session.id, waiting: waitingForReply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("execute-flow error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ──

function findNextNode(
  currentId: string,
  edges: any[],
  _nodes: any[],
  inboundMsg: string | null,
  inboundInteractive: any | null
): string | null {
  // Find edges from current node
  const outEdges = edges.filter((e: any) => e.source === currentId);
  if (outEdges.length === 0) return null;

  // If interactive response, match by button/list id
  if (inboundInteractive) {
    const responseId = inboundInteractive.button_id || inboundInteractive.list_item_id || "";
    const matchedEdge = outEdges.find(
      (e: any) => e.sourceHandle === responseId || e.data?.match === responseId
    );
    if (matchedEdge) return matchedEdge.target;
  }

  // If text message, check for keyword-based edges
  if (inboundMsg) {
    const matchedEdge = outEdges.find((e: any) => {
      const label = (e.data?.label || e.label || "").toLowerCase();
      return label && inboundMsg.toLowerCase().includes(label);
    });
    if (matchedEdge) return matchedEdge.target;
  }

  // Default: take the first edge (or one marked "default")
  const defaultEdge = outEdges.find((e: any) => e.data?.isDefault || e.sourceHandle === "default") || outEdges[0];
  return defaultEdge?.target || null;
}

function resolveVariables(text: string, variables: Record<string, string>, contact: any): string {
  let resolved = text;
  resolved = resolved.replace(/\{\{name\}\}/g, contact.name || "there");
  resolved = resolved.replace(/\{\{phone\}\}/g, contact.phone_number || "");
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return resolved;
}

async function sendWhatsAppMessage(
  supabase: any,
  exotelUrl: string,
  creds: any,
  params: {
    to: string;
    org_id: string;
    contact_id: string;
    conversation_id: string;
    text: string;
    media_url: string | null;
  }
) {
  const content: any = params.media_url
    ? { type: "image", image: { link: params.media_url, caption: params.text } }
    : { type: "text", text: { body: params.text } };

  const payload = {
    whatsapp: {
      messages: [
        { from: creds.senderNumber, to: params.to, content },
      ],
    },
  };

  const res = await fetch(exotelUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  const msgData = result?.response?.whatsapp?.messages?.[0];

  await supabase.from("messages").insert({
    contact_id: params.contact_id,
    conversation_id: params.conversation_id,
    org_id: params.org_id,
    content: params.text,
    media_url: params.media_url,
    direction: "outbound",
    status: res.ok && msgData?.status === "success" ? "sent" : "failed",
    sent_at: new Date().toISOString(),
    exotel_message_id: msgData?.data?.sid || null,
  });

  // Update conversation preview
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: params.text.substring(0, 100),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.conversation_id);
}

async function sendWhatsAppInteractive(
  supabase: any,
  exotelUrl: string,
  creds: any,
  params: {
    to: string;
    org_id: string;
    contact_id: string;
    conversation_id: string;
    type: "button" | "list";
    body: string;
    buttons?: any[];
    button_text?: string;
    sections?: any[];
  }
) {
  const interactive: any = {
    type: params.type,
    body: { text: params.body },
  };

  if (params.type === "button") {
    interactive.action = { buttons: params.buttons };
  } else {
    interactive.action = {
      button: params.button_text || "Choose",
      sections: params.sections,
    };
  }

  const content = { type: "interactive", interactive };
  const payload = {
    whatsapp: {
      messages: [
        { from: creds.senderNumber, to: params.to, content },
      ],
    },
  };

  const res = await fetch(exotelUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  const msgData = result?.response?.whatsapp?.messages?.[0];

  await supabase.from("messages").insert({
    contact_id: params.contact_id,
    conversation_id: params.conversation_id,
    org_id: params.org_id,
    content: params.body,
    message_type: params.type === "button" ? "buttons" : "list",
    interactive_data: params.type === "button" ? { buttons: params.buttons } : { sections: params.sections },
    direction: "outbound",
    status: res.ok && msgData?.status === "success" ? "sent" : "failed",
    sent_at: new Date().toISOString(),
    exotel_message_id: msgData?.data?.sid || null,
  });

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: `[${params.type === "button" ? "Buttons" : "List"}] ${params.body.substring(0, 80)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.conversation_id);
}
