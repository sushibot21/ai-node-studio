import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange
} from "@xyflow/react";
import type { AnyNodeData } from "./lib/types";

let idCounter = 1;
export const nextId = () => `node_${idCounter++}`;

export interface ChatMessage { role: "assistant" | "user"; text: string; }
export interface WorkflowChat { id: string; title: string; nodes: Node<AnyNodeData>[]; edges: Edge[]; messages?: ChatMessage[]; updatedAt: number; }
const welcomeMessage: ChatMessage = { role: "assistant", text: "What are you trying to accomplish? I’ll turn your brief into a workflow, then you can inspect or run it whenever you want." };
const makeChat = (): WorkflowChat => ({ id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: "New workflow", nodes: [], edges: [], messages: [welcomeMessage], updatedAt: Date.now() });
const initialChat: WorkflowChat = { id: "chat_1", title: "New workflow", nodes: [], edges: [], messages: [welcomeMessage], updatedAt: Date.now() };

interface StoreState {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<Node<AnyNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node<AnyNodeData>) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  setGraph: (nodes: Node<AnyNodeData>[], edges: Edge[]) => void;
  setGraphForChat: (chatId: string, nodes: Node<AnyNodeData>[], edges: Edge[]) => void;
  chats: WorkflowChat[];
  activeChatId: string;
  newChat: () => void;
  selectChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
}

export const useGraphStore = create<StoreState>()(persist((set, get) => ({
  nodes: [],
  edges: [],
  chats: [initialChat], activeChatId: initialChat.id,
  onNodesChange: (changes) => {
    const nodes = applyNodeChanges<Node<AnyNodeData>>(changes, get().nodes);
    set({ nodes, chats: get().chats.map((chat) => chat.id === get().activeChatId ? { ...chat, nodes, updatedAt: Date.now() } : chat) });
  },
  onEdgesChange: (changes) => {
    const edges = applyEdgeChanges(changes, get().edges);
    set({ edges, chats: get().chats.map((chat) => chat.id === get().activeChatId ? { ...chat, edges, updatedAt: Date.now() } : chat) });
  },
  onConnect: (connection) => {
    const edges = addEdge(connection, get().edges);
    set({ edges, chats: get().chats.map((chat) => chat.id === get().activeChatId ? { ...chat, edges, updatedAt: Date.now() } : chat) });
  },
  addNode: (node) => {
    const nodes = [...get().nodes, node];
    set({ nodes, chats: get().chats.map((chat) => chat.id === get().activeChatId ? { ...chat, nodes, updatedAt: Date.now() } : chat) });
  },
  updateNodeData: (id, data) =>
    {
      const nodes = get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
      set({ nodes, chats: get().chats.map((chat) => chat.id === get().activeChatId ? { ...chat, nodes, updatedAt: Date.now() } : chat) });
    },
  setGraph: (nodes, edges) => set({ nodes, edges, chats: get().chats.map((chat) => chat.id === get().activeChatId ? { ...chat, nodes, edges, updatedAt: Date.now() } : chat) }),
  // Write graph state to a SPECIFIC chat regardless of what's currently active —
  // used by long-running audits so a mid-run chat switch doesn't cross-write.
  setGraphForChat: (chatId, nodes, edges) => set({
    ...(chatId === get().activeChatId ? { nodes, edges } : {}),
    chats: get().chats.map((chat) => chat.id === chatId ? { ...chat, nodes, edges, updatedAt: Date.now() } : chat)
  }),
  newChat: () => {
    const chat = makeChat();
    set({ chats: [chat, ...get().chats], activeChatId: chat.id, nodes: [], edges: [] });
  },
  selectChat: (id) => {
    const chat = get().chats.find((item) => item.id === id);
    if (chat) set({ activeChatId: id, nodes: chat.nodes, edges: chat.edges });
  },
  renameChat: (id, title) => set({ chats: get().chats.map((chat) => chat.id === id ? { ...chat, title: title || "Untitled workflow", updatedAt: Date.now() } : chat) }),
  // Remove a conversation. If it was active, fall to the next one; if none are
  // left, seed a fresh empty chat so the app always has an active conversation.
  deleteChat: (id) => {
    let chats = get().chats.filter((chat) => chat.id !== id);
    if (!chats.length) chats = [makeChat()];
    if (get().activeChatId === id) {
      const next = chats[0];
      set({ chats, activeChatId: next.id, nodes: next.nodes, edges: next.edges });
    } else {
      set({ chats });
    }
  },
  setChatMessages: (messages) => set({ chats: get().chats.map((chat) => chat.id === get().activeChatId ? { ...chat, messages, updatedAt: Date.now() } : chat) })
}), {
  name: "ai-node-studio-workflow",
  version: 1,
  // localStorage is ~5MB. Node outputs now include full-page screenshots (base64)
  // and report HTML, which blow the quota. Strip those bulky payloads from the
  // PERSISTED snapshot only — the live in-memory state keeps them for the session
  // (report opens, Figma writes work); a reload just loses cached run outputs.
  storage: createJSONStorage(() => ({
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { /* quota exceeded — skip persisting this update rather than crash the run */ } },
    removeItem: (key) => localStorage.removeItem(key)
  })),
  migrate: (persisted: any, version) => version < 1 ? { ...persisted, chats: [{ id: "chat_1", title: "Existing workflow", nodes: persisted.nodes || [], edges: persisted.edges || [], updatedAt: Date.now() }], activeChatId: "chat_1" } : persisted,
  partialize: (state) => ({ nodes: slimNodes(state.nodes), edges: state.edges, chats: state.chats.map((chat) => ({ ...chat, nodes: slimNodes(chat.nodes) })), activeChatId: state.activeChatId })
}));

// Removes bulky, regenerable payloads (screenshots, report HTML, large outputs,
// file attachments) from nodes before they are written to localStorage.
function slimNodes(nodes: Node<AnyNodeData>[]): Node<AnyNodeData>[] {
  return (nodes || []).map((node) => {
    const data: any = { ...node.data };
    if (typeof data.output === "string" && data.output.length > 4000) data.output = undefined;
    delete data.screenshot;
    delete data.regions;
    delete data.attachmentData;
    return { ...node, data };
  });
}
