import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Node, Edge, OnNodesChange, OnEdgesChange, applyNodeChanges, applyEdgeChanges, addEdge, Connection } from 'reactflow';
import { checkExists, ensureUserDirectories } from '@/lib/fileSystem';
import { useSettingsStore } from './useSettingsStore';

export interface MindMapCategory {
  id: string;
  name: string;
  color: string;
}

export interface MindMapTheme {
  id: string;
  name: string;
  background: { color: string; pattern: 'clean' | 'dots' | 'lines' | 'cross' };
  node: { borderRadius: string; shadow: string; border: string };
  edge: { stroke: string; strokeWidth: number; type: 'default' | 'straight' | 'step' | 'smoothstep' | 'bezier'; strokeDasharray?: string };
}

export type MindmapCollabOp =
  | { type: 'nodes.change'; changes: any[] }
  | { type: 'edges.change'; changes: any[] }
  | { type: 'edge.add'; connection: Connection }
  | { type: 'edge.data'; edgeId: string; data: any }
  | { type: 'node.add'; node: Node; edges?: Edge[] }
  | { type: 'node.delete'; id: string }
  | { type: 'edge.delete'; id: string }
  | { type: 'node.category'; nodeId: string; categoryId: string }
  | { type: 'node.label'; nodeId: string; label: string }
  | { type: 'node.data'; nodeId: string; data: any }
  | { type: 'node.edgeType'; nodeId: string; edgeType: string }
  | { type: 'category.add'; category: MindMapCategory }
  | { type: 'category.delete'; id: string }
  | { type: 'group.nodes'; nodeIds: string[]; groupLabel?: string }
  | { type: 'group.create'; position?: { x: number; y: number } }
  | { type: 'node.parent'; nodeId: string; parentId?: string }
  | { type: 'group.ungroup'; groupId: string }
  | { type: 'theme.set'; theme: MindMapTheme };

const getSyncableNodeChanges = (changes: any[]) => changes.filter((change) => change?.type !== 'select');
const getSyncableEdgeChanges = (changes: any[]) => changes.filter((change) => change?.type !== 'select');

interface AppState {
  // Mindmap State
  nodes: Node[];
  edges: Edge[];
  categories: MindMapCategory[];
  mindMapTheme: MindMapTheme;
  setMindMapTheme: (theme: MindMapTheme) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (label: string, categoryId?: string, parentId?: string, position?: { x: number; y: number }, sourceHandle?: string, nodeId?: string, extraData?: Record<string, any>) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  updateEdgeData: (edgeId: string, data: any) => void;
  updateNodeCategory: (nodeId: string, categoryId: string) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  updateNodeEdgeType: (nodeId: string, type: string) => void;
  addCategory: (name: string, color: string) => void;
  deleteCategory: (id: string) => void;
  groupNodes: (nodeIds: string[], groupLabel?: string) => void;
  ungroupNode: (groupId: string) => void;
  createGroup: (position?: { x: number; y: number }) => void;
  assignNodeParent: (nodeId: string, parentId: string | undefined) => void;
  setMindMapState: (nodes: Node[], edges: Edge[], categories?: MindMapCategory[], theme?: MindMapTheme) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  // Undo / Redo
  _undoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  _redoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  _collabEmitter: ((op: MindmapCollabOp) => void) | null;
  _suppressCollab: boolean;
  setCollabEmitter: (emitter: ((op: MindmapCollabOp) => void) | null) => void;
  applyCollabOperation: (op: MindmapCollabOp) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      _collabEmitter: null,
      _suppressCollab: false,
      nodes: [
        { 
          id: '1', 
          type: 'mindMap',
          position: { x: 0, y: 0 }, 
          data: { label: 'Central Theme', category: 'default' } 
        },
      ],
      edges: [],
      // ─── History ───────────────────────────────────────────────────────────
      _undoStack: [],
      _redoStack: [],
      snapshot: () => {
        const { nodes, edges, _undoStack } = get();
        const stack = [..._undoStack, { nodes, edges }];
        if (stack.length > 50) stack.shift();
        set({ _undoStack: stack, _redoStack: [] });
      },
      undo: () => {
        const { nodes, edges, _undoStack, _redoStack } = get();
        if (_undoStack.length === 0) return;
        const prev = _undoStack[_undoStack.length - 1];
        set({
          nodes: prev.nodes,
          edges: prev.edges,
          _undoStack: _undoStack.slice(0, -1),
          _redoStack: [..._redoStack, { nodes, edges }],
        });
      },
      redo: () => {
        const { nodes, edges, _undoStack, _redoStack } = get();
        if (_redoStack.length === 0) return;
        const next = _redoStack[_redoStack.length - 1];
        set({
          nodes: next.nodes,
          edges: next.edges,
          _undoStack: [..._undoStack, { nodes, edges }],
          _redoStack: _redoStack.slice(0, -1),
        });
      },
      categories: [
        { id: 'default', name: 'General', color: '#e5e7eb' }, // Gray-200
        { id: 'characters', name: 'Characters', color: '#bfdbfe' }, // Blue-200
        { id: 'plot', name: 'Plot', color: '#fde68a' }, // Amber-200
        { id: 'builds', name: 'Builds', color: '#bbf7d0' }, // Green-200
      ],
      mindMapTheme: {
        id: 'default',
        name: 'Default',
        background: { color: '#f8fafc', pattern: 'clean' },
        node: { borderRadius: '9999px', shadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', border: '2px solid transparent' },
        edge: { stroke: '#b1b1b7', strokeWidth: 2, type: 'smoothstep' }
      },
      setCollabEmitter: (emitter) => set({ _collabEmitter: emitter }),
      applyCollabOperation: (op) => {
        set({ _suppressCollab: true });
        try {
          switch (op.type) {
            case 'nodes.change':
              set({ nodes: applyNodeChanges(getSyncableNodeChanges(op.changes), get().nodes) });
              break;
            case 'edges.change':
              set({ edges: applyEdgeChanges(getSyncableEdgeChanges(op.changes), get().edges) });
              break;
            case 'edge.add':
              get().onConnect(op.connection);
              break;
            case 'node.add': {
              const existingNodeIds = new Set(get().nodes.map((n) => n.id));
              const existingEdgeIds = new Set(get().edges.map((e) => e.id));
              set({
                nodes: existingNodeIds.has(op.node.id) ? get().nodes : [...get().nodes, op.node],
                edges: [...get().edges, ...((op.edges || []).filter((edge) => !existingEdgeIds.has(edge.id)))],
              });
              break;
            }
            case 'node.delete':
              get().deleteNode(op.id);
              break;
            case 'edge.delete':
              get().deleteEdge(op.id);
              break;
            case 'edge.data':
              get().updateEdgeData(op.edgeId, op.data);
              break;
            case 'node.category':
              get().updateNodeCategory(op.nodeId, op.categoryId);
              break;
            case 'node.label':
              get().updateNodeLabel(op.nodeId, op.label);
              break;
            case 'node.data':
              get().updateNodeData(op.nodeId, op.data);
              break;
            case 'node.edgeType':
              get().updateNodeEdgeType(op.nodeId, op.edgeType);
              break;
            case 'category.add':
              set({ categories: [...get().categories, op.category] });
              break;
            case 'category.delete':
              get().deleteCategory(op.id);
              break;
            case 'group.nodes':
              get().groupNodes(op.nodeIds, op.groupLabel);
              break;
            case 'group.create':
              get().createGroup(op.position);
              break;
            case 'node.parent':
              get().assignNodeParent(op.nodeId, op.parentId);
              break;
            case 'group.ungroup':
              get().ungroupNode(op.groupId);
              break;
            case 'theme.set':
              set({ mindMapTheme: op.theme });
              break;
          }
        } finally {
          set({ _suppressCollab: false });
        }
      },
      setMindMapTheme: (theme) => {
        set({ mindMapTheme: theme });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'theme.set', theme });
      },
      // ... (rest of mindmap state)

      onNodesChange: (changes) => {
        if (!get()._suppressCollab && changes.some((c: any) => c.type === 'remove')) get().snapshot();
        set({
          nodes: applyNodeChanges(changes, get().nodes),
        });
        if (!get()._suppressCollab) {
          const syncableChanges = getSyncableNodeChanges(changes);
          if (syncableChanges.length > 0) get()._collabEmitter?.({ type: 'nodes.change', changes: syncableChanges });
        }
      },
      onEdgesChange: (changes) => {
        if (!get()._suppressCollab && changes.some((c: any) => c.type === 'remove')) get().snapshot();
        set({
          edges: applyEdgeChanges(changes, get().edges),
        });
        if (!get()._suppressCollab) {
          const syncableChanges = getSyncableEdgeChanges(changes);
          if (syncableChanges.length > 0) get()._collabEmitter?.({ type: 'edges.change', changes: syncableChanges });
        }
      },
      onConnect: (connection) => {
        // Prevent self-loops
        if (connection.source === connection.target) return;
        if (!get()._suppressCollab) get().snapshot();
        const sourceNode = get().nodes.find(n => n.id === connection.source);
        const pathType = sourceNode?.data?.outgoingEdgeType || get().mindMapTheme.edge.type;
        set({
          edges: addEdge({ ...connection, type: 'mindMap', data: { pathType } }, get().edges),
        });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'edge.add', connection });
      },
      addNode: (label, categoryId = 'default', parentId, position, sourceHandle, nodeId, extraData) => {
        if (!get()._suppressCollab) get().snapshot();
        const previousEdges = get().edges;
        const newId = nodeId || Math.random().toString(36).substr(2, 9);
        const category = get().categories.find(c => c.id === categoryId);
        const mindMapTheme = get().mindMapTheme;
        
        // Calculate position based on parent if provided, or use provided position
        let finalPosition = position || { x: Math.random() * 400, y: Math.random() * 400 };
        
        if (!position && parentId) {
            const parent = get().nodes.find(n => n.id === parentId);
            if (parent) {
                finalPosition = { 
                    x: parent.position.x + 200, 
                    y: parent.position.y + (Math.random() * 100 - 50) 
                };
            }
        }

        // Check if finalPosition is inside any group
        const groups = get().nodes.filter(n => n.type === 'groupNode');
        let actualParentNodeId = undefined;
        let relativePosition = finalPosition;

        // Find group containing the point
        const group = groups.find(g => {
            const x = g.position.x;
            const y = g.position.y;
            const w = g.width || g.style?.width || 400; // Fallback
            const h = g.height || g.style?.height || 400;
            
            return finalPosition.x >= x && finalPosition.x <= x + Number(w) &&
                   finalPosition.y >= y && finalPosition.y <= y + Number(h);
        });

        if (group) {
            actualParentNodeId = group.id;
            relativePosition = {
                x: finalPosition.x - group.position.x,
                y: finalPosition.y - group.position.y
            };
        }

        const newNode = {
          id: newId,
          type: extraData?.nodeType ? 'specialNode' : 'mindMap',
          position: relativePosition,
          parentNode: actualParentNodeId,
          extent: actualParentNodeId ? 'parent' : undefined as 'parent' | undefined, 
          zIndex: actualParentNodeId ? 10 : undefined,
          data: { label, category: categoryId, ...(extraData || {}), ...(extraData?.nodeType ? { nodeScale: 0.75 } : {}) },
          style: extraData?.nodeType ? {
                width:  Math.round(((extraData.nodeType === 'brainstorm' || extraData.nodeType === 'storytelling' || extraData.nodeType === 'table') ? 340 : 280) * 0.75),
              height: Math.round(300 * 0.75),
          } : { 
              backgroundColor: 'transparent', 
              border: 'none', 
              width: 'auto',
          } 
        };
        
        const newNodes = [...get().nodes, newNode];
        // Ensure child is after parent in array (ReactFlow requirement for z-index sometimes, but parentNode handles it mostly)
        // But sorting by groupNode first is good.
        
        const newEdges = [...get().edges];

        if (parentId) {
            let targetHandle = null;
            if (sourceHandle) {
                if (sourceHandle === 'top') targetHandle = 'bottom';
                else if (sourceHandle === 'bottom') targetHandle = 'top';
                else if (sourceHandle === 'left') targetHandle = 'right';
                else if (sourceHandle === 'right') targetHandle = 'left';
            }

            newEdges.push({
                id: `e${parentId}-${newId}`,
                source: parentId,
                target: newId,
                sourceHandle: sourceHandle,
                targetHandle: targetHandle,
                type: 'mindMap', // Custom edge type
                data: { pathType: get().nodes.find(n => n.id === parentId)?.data?.outgoingEdgeType || mindMapTheme.edge.type }
            });
        }

        set({ nodes: newNodes, edges: newEdges });
        if (!get()._suppressCollab) {
          const addedEdges = newEdges.filter((edge) => !previousEdges.find((existing) => existing.id === edge.id));
          get()._collabEmitter?.({ type: 'node.add', node: newNode as Node, edges: addedEdges });
        }
      },
      deleteNode: (id) => {
          if (!get()._suppressCollab) get().snapshot();
          const nodes = get().nodes;
          // Check if this node is a parent to others
          const children = nodes.filter(n => n.parentNode === id);
          
          let newNodes = nodes.filter(n => n.id !== id);
          
          // If it had children, ungroup them (remove parentNode)
          if (children.length > 0) {
              newNodes = newNodes.map(n => {
                  if (n.parentNode === id) {
                      // We need to adjust position to be absolute since it's no longer relative to parent
                      // But wait, if we just remove the parent, the child's position (relative) 
                      // will be interpreted as absolute, which might jump it to 0,0 or similar relative to canvas.
                      // We should calculate the absolute position.
                      const parentNode = nodes.find(p => p.id === id);
                      let newPos = n.position;
                      if (parentNode) {
                          newPos = {
                              x: parentNode.position.x + n.position.x,
                              y: parentNode.position.y + n.position.y
                          };
                      }
                      
                      return {
                          ...n,
                          parentNode: undefined,
                          position: newPos,
                          extent: undefined,
                          zIndex: undefined
                      };
                  }
                  return n;
              });
          }

          set({
              nodes: newNodes,
              edges: get().edges.filter(e => e.source !== id && e.target !== id)
          });
          if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'node.delete', id });
      },
      deleteEdge: (id) => {
          if (!get()._suppressCollab) get().snapshot();
          set({ edges: get().edges.filter(e => e.id !== id) });
          if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'edge.delete', id });
      },
        updateEdgeData: (edgeId, data) => {
          if (!get()._suppressCollab) get().snapshot();
          set({
            edges: get().edges.map((edge) =>
              edge.id === edgeId
              ? { ...edge, data: { ...edge.data, ...data } }
              : edge
            )
          });
          if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'edge.data', edgeId, data });
        },
      updateNodeCategory: (nodeId, categoryId) => {
        if (!get()._suppressCollab) get().snapshot();
        set({
          nodes: get().nodes.map(n => 
            n.id === nodeId 
              ? { 
                  ...n, 
                  data: { 
                    ...n.data, 
                    category: categoryId,
                    style: {
                        ...(n.data.style || {}),
                        backgroundColor: undefined // Clear custom color so category color takes precedence
                    }
                  }, 
                }
              : n
          )
        });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'node.category', nodeId, categoryId });

      },
      updateNodeLabel: (nodeId, label) => {
        set({
          nodes: get().nodes.map(n => 
            n.id === nodeId 
              ? { ...n, data: { ...n.data, label } }
              : n
          )
        });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'node.label', nodeId, label });

      },
      updateNodeData: (nodeId, data) => {
        // Don't snapshot for notes/attachments changes (too frequent; they're auto-saved)
        const isContentEdit = 'notes' in data || 'attachments' in data;
        if (!get()._suppressCollab && !isContentEdit) get().snapshot();
        set({
          nodes: get().nodes.map(n => 
            n.id === nodeId 
              ? { ...n, data: { ...n.data, ...data } }
              : n
          )
        });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'node.data', nodeId, data });
      },
      updateNodeEdgeType: (nodeId, type) => {
        if (!get()._suppressCollab) get().snapshot();
        // Update node data to store preference
        const nodes = get().nodes.map(n => 
            n.id === nodeId 
            ? { ...n, data: { ...n.data, outgoingEdgeType: type } }
            : n
        );
        
        // Update existing outgoing edges
        const edges = get().edges.map(e => 
            e.source === nodeId 
            ? { ...e, data: { ...e.data, pathType: type } }
            : e
        );

        set({ nodes, edges });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'node.edgeType', nodeId, edgeType: type });
      },
      addCategory: (name, color) => {
        const newCategory = { id: Date.now().toString(), name, color };
        set({ categories: [...get().categories, newCategory] });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'category.add', category: newCategory });
      },
      deleteCategory: (id) => {
        set({ categories: get().categories.filter(c => c.id !== id) });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'category.delete', id });
      },
      groupNodes: (nodeIds, groupLabel = 'New Group') => {
        if (!get()._suppressCollab) get().snapshot();
        const nodes = get().nodes;
        const selectedNodes = nodes.filter(n => nodeIds.includes(n.id));
        
        if (selectedNodes.length === 0) return;

        // Helper to get absolute position recursively
        const getAbsolutePosition = (node: Node) => {
            let x = node.position.x;
            let y = node.position.y;
            let currentParentId = node.parentNode;
            
            while (currentParentId) {
                const parent = nodes.find(n => n.id === currentParentId);
                if (parent) {
                    x += parent.position.x;
                    y += parent.position.y;
                    currentParentId = parent.parentNode;
                } else {
                    break;
                }
            }
            return { x, y };
        };

        // Identify "roots" of the selection (nodes whose parents are NOT in the selection)
        // These are the only ones we need to reparent to the new group.
        // The others will move implicitly with their parents.
        const rootNodes = selectedNodes.filter(node => 
            !node.parentNode || !nodeIds.includes(node.parentNode)
        );

        // Calculate bounding box of ALL selected nodes (including descendants) to ensure group is big enough
        // We need absolute positions for this
        const allSelectedNodesWithAbs = selectedNodes.map(n => ({
            ...n,
            absPos: getAbsolutePosition(n)
        }));

        const minX = Math.min(...allSelectedNodesWithAbs.map(n => n.absPos.x));
        const minY = Math.min(...allSelectedNodesWithAbs.map(n => n.absPos.y));
        const maxX = Math.max(...allSelectedNodesWithAbs.map(n => n.absPos.x + (n.width ?? (typeof n.style?.width === 'number' ? n.style.width : parseInt(n.style?.width as string || '150')))));
        const maxY = Math.max(...allSelectedNodesWithAbs.map(n => n.absPos.y + (n.height ?? (typeof n.style?.height === 'number' ? n.style.height : parseInt(n.style?.height as string || '50')))));
        
        const PADDING = 40;
        const MIN_SIZE = 200;
        
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        const groupWidth = Math.max(MIN_SIZE, contentWidth + (PADDING * 2));
        const groupHeight = Math.max(MIN_SIZE, contentHeight + (PADDING * 2));

        // Calculate offsets to center the content within the group
        const offsetX = (groupWidth - contentWidth) / 2;
        const offsetY = (groupHeight - contentHeight) / 2;

        const groupId = `group-${Math.random().toString(36).substr(2, 9)}`;
        
        const groupNode: Node = {
            id: groupId,
            type: 'groupNode',
            position: { x: minX - offsetX, y: minY - offsetY }, 
            style: { width: groupWidth, height: groupHeight }, 
            data: { label: groupLabel },
        };

        // Reparent only the root nodes to the new group
        // We need to adjust their position to be relative to the new group
        const updatedRoots = rootNodes.map(node => {
            const absPos = getAbsolutePosition(node);
            return {
                ...node,
                parentNode: groupId,
                zIndex: 10,
                position: {
                    x: absPos.x - (minX - offsetX),
                    y: absPos.y - (minY - offsetY)
                }
            };
        });

        // The non-root selected nodes stay as they are (relative to their parents)
        // But we need to make sure they are in the final list
        const nonRootSelectedNodes = selectedNodes.filter(n => !rootNodes.find(r => r.id === n.id));
        const otherNodes = nodes.filter(n => !nodeIds.includes(n.id));
        
        const newNodes = [...otherNodes, groupNode, ...updatedRoots, ...nonRootSelectedNodes];

        // Sort nodes by hierarchy depth to ensure correct rendering order
        // Parents must come before children
        const getDepth = (n: Node, list: Node[]): number => {
            if (!n.parentNode) return 0;
            const parent = list.find(p => p.id === n.parentNode);
            if (!parent) return 0;
            return 1 + getDepth(parent, list);
        };

        newNodes.sort((a, b) => {
            const depthA = getDepth(a, newNodes);
            const depthB = getDepth(b, newNodes);
            if (depthA !== depthB) return depthA - depthB;
            
            // If same depth, groups first
            if (a.type === 'groupNode' && b.type !== 'groupNode') return -1;
            if (a.type !== 'groupNode' && b.type === 'groupNode') return 1;
            return 0;
        });

        set({
            nodes: newNodes
        });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'group.nodes', nodeIds, groupLabel });
      },
      createGroup: (position) => {
        if (!get()._suppressCollab) get().snapshot();
        const newId = `group-${Math.random().toString(36).substr(2, 9)}`;
        const newGroup = {
            id: newId,
            type: 'groupNode',
            position: position || { x: 100, y: 100 },
            style: { width: 400, height: 400 }, // Removed zIndex: -1
            data: { label: 'New Group' },
        };
        
        const newNodes = [...get().nodes, newGroup];
        
        const getDepth = (n: Node, list: Node[]): number => {
            if (!n.parentNode) return 0;
            const parent = list.find(p => p.id === n.parentNode);
            if (!parent) return 0;
            return 1 + getDepth(parent, list);
        };

        newNodes.sort((a, b) => {
            const depthA = getDepth(a, newNodes);
            const depthB = getDepth(b, newNodes);
            if (depthA !== depthB) return depthA - depthB;

            if (a.type === 'groupNode' && b.type !== 'groupNode') return -1;
            if (a.type !== 'groupNode' && b.type === 'groupNode') return 1;
            return 0;
        });

        set({ nodes: newNodes });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'group.create', position });
      },
      assignNodeParent: (nodeId, parentId) => {
         const nodes = get().nodes;
         const node = nodes.find(n => n.id === nodeId);
         
         if (!node) return;
         if (node.parentNode === parentId) return; // No change
         
         // Check for circular dependency
         if (parentId) {
             let currentParentId: string | undefined = parentId;
             while (currentParentId) {
                 if (currentParentId === nodeId) {
                     console.warn("Cannot assign a node as a child of its own descendant.");
                     return;
                 }
                 const parentNode = nodes.find(n => n.id === currentParentId);
                 currentParentId = parentNode?.parentNode;
             }
         }

         // Calculate absolute position recursively
         let absX = node.position.x;
         let absY = node.position.y;
         let currentParentId = node.parentNode;
         
         while (currentParentId) {
             const parent = nodes.find(n => n.id === currentParentId);
             if (parent) {
                 absX += parent.position.x;
                 absY += parent.position.y;
                 currentParentId = parent.parentNode;
             } else {
                 break;
             }
         }
         
         let newNodes = [];
         
         if (parentId) {
             const parent = nodes.find(n => n.id === parentId);
             if (parent) {
                 // Calculate parent's absolute position recursively
                 let parentAbsX = parent.position.x;
                 let parentAbsY = parent.position.y;
                 let pParentId = parent.parentNode;
                 
                 while (pParentId) {
                     const pParent = nodes.find(n => n.id === pParentId);
                     if (pParent) {
                         parentAbsX += pParent.position.x;
                         parentAbsY += pParent.position.y;
                         pParentId = pParent.parentNode;
                     } else {
                         break;
                     }
                 }

                 const relX = absX - parentAbsX;
                 const relY = absY - parentAbsY;
                 
                 newNodes = nodes.map(n => n.id === nodeId ? {
                     ...n,
                     parentNode: parentId,
                     extent: undefined, // Ensure no extent constraint
                     position: { x: relX, y: relY },
                     zIndex: 10 // Ensure child is above parent
                 } : n);
             } else {
                 newNodes = nodes;
             }
         } else {
             // Detaching
             newNodes = nodes.map(n => n.id === nodeId ? {
                 ...n,
                 parentNode: undefined,
                 extent: undefined,
                 position: { x: absX, y: absY },
                 zIndex: undefined // Reset zIndex
             } : n);
         }

         // Always sort to prevent "Parent not found" errors
         const getDepth = (n: Node, list: Node[]): number => {
            if (!n.parentNode) return 0;
            const parent = list.find(p => p.id === n.parentNode);
            if (!parent) return 0;
            return 1 + getDepth(parent, list);
        };

         newNodes.sort((a, b) => {
            const depthA = getDepth(a, newNodes);
            const depthB = getDepth(b, newNodes);
            if (depthA !== depthB) return depthA - depthB;
            
            if (a.type === 'groupNode' && b.type !== 'groupNode') return -1;
            if (a.type !== 'groupNode' && b.type === 'groupNode') return 1;
            return 0;
         });

         set({ nodes: newNodes });
         if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'node.parent', nodeId, parentId });
      },
      ungroupNode: (groupId) => {
        if (!get()._suppressCollab) get().snapshot();
        const nodes = get().nodes;
        const groupNode = nodes.find(n => n.id === groupId);
        if (!groupNode) return;

        const children = nodes.filter(n => n.parentNode === groupId);
        
        // Calculate absolute positions for children
        const updatedChildren = children.map(child => ({
            ...child,
            parentNode: undefined,
            extent: undefined,
            position: {
                x: groupNode.position.x + child.position.x,
                y: groupNode.position.y + child.position.y
            }
        }));

        const otherNodes = nodes.filter(n => n.id !== groupId && n.parentNode !== groupId);
        
        set({
            nodes: [...otherNodes, ...updatedChildren]
        });
        if (!get()._suppressCollab) get()._collabEmitter?.({ type: 'group.ungroup', groupId });
      },
      setMindMapState: (nodes, edges, categories, theme) => {
        if (!get()._suppressCollab) get().snapshot();
        set({ 
          nodes: nodes.map(n => ({ ...n, type: n.type || 'mindMap' })), 
          edges: edges.map(e => ({ ...e, type: e.type || 'mindMap' })), 
          categories: categories || get().categories,
          mindMapTheme: theme || get().mindMapTheme,
        });
      },
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
    }),
    {
      name: 'creative-planner-storage',
      partialize: (state) => {
        // Exclude runtime-only undo/redo stacks from localStorage
        const { _undoStack, _redoStack, snapshot, undo, redo, _collabEmitter, _suppressCollab, setCollabEmitter, applyCollabOperation, ...persisted } = state;
        return persisted;
      },
    }
  )
);
