import { Node, Edge } from 'reactflow';

const NODE_W = 160;
const NODE_H = 50;
const H_GAP = 60;
const V_GAP = 80;
const RADIAL_BASE = 220;

//  types 

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

//  helpers 

function buildAdjacency(nodes: Node[], edges: Edge[]) {
  const childMap: Record<string, string[]> = {};
  const parentMap: Record<string, string> = {};
  nodes.forEach((n) => { childMap[n.id] = []; });
  edges.forEach((e) => {
    if (childMap[e.source] !== undefined) childMap[e.source].push(e.target);
    if (parentMap[e.target] === undefined) parentMap[e.target] = e.source;
  });
  const roots = nodes.filter((n) => parentMap[n.id] === undefined).map((n) => n.id);
  return { childMap, parentMap, roots };
}

function subtreeHeight(id: string, childMap: Record<string, string[]>): number {
  const kids = childMap[id] ?? [];
  if (kids.length === 0) return NODE_H;
  const kidsH = kids.map((c) => subtreeHeight(c, childMap));
  return kidsH.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP;
}

function subtreeWidth(id: string, childMap: Record<string, string[]>): number {
  const kids = childMap[id] ?? [];
  if (kids.length === 0) return NODE_W;
  const kidsW = kids.map((c) => subtreeWidth(c, childMap));
  return kidsW.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP;
}

function applyPositions(nodes: Node[], positions: Record<string, { x: number; y: number }>): Node[] {
  return nodes.map((n) => ({
    ...n,
    position: positions[n.id] ?? n.position,
    parentNode: n.parentNode,
  }));
}

/**
 * For each edge, pick the source/target handle that best aligns with
 * the straight-line direction between the two node centres.
 */
function computeEdgeHandles(
  edges: Edge[],
  positions: Record<string, { x: number; y: number }>,
): Edge[] {
  return edges.map((edge) => {
    const sp = positions[edge.source];
    const tp = positions[edge.target];
    if (!sp || !tp) return edge;

    const dx = (tp.x + NODE_W / 2) - (sp.x + NODE_W / 2);
    const dy = (tp.y + NODE_H / 2) - (sp.y + NODE_H / 2);

    let sourceHandle: string;
    let targetHandle: string;

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) { sourceHandle = 'right';  targetHandle = 'left';   }
      else         { sourceHandle = 'left';   targetHandle = 'right';  }
    } else {
      if (dy >= 0) { sourceHandle = 'bottom'; targetHandle = 'top';    }
      else         { sourceHandle = 'top';    targetHandle = 'bottom'; }
    }

    return { ...edge, sourceHandle, targetHandle };
  });
}

//  Top-Bottom Tree 

function placeTB(
  id: string, cx: number, y: number,
  childMap: Record<string, string[]>,
  pos: Record<string, { x: number; y: number }>,
) {
  pos[id] = { x: cx - NODE_W / 2, y };
  const kids = childMap[id] ?? [];
  if (!kids.length) return;
  const widths = kids.map((c) => subtreeWidth(c, childMap));
  const total = widths.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP;
  let x = cx - total / 2;
  kids.forEach((child, i) => {
    placeTB(child, x + widths[i] / 2, y + NODE_H + V_GAP, childMap, pos);
    x += widths[i] + H_GAP;
  });
}

export function layoutTreeTB(nodes: Node[], edges: Edge[]): LayoutResult {
  const { childMap, roots } = buildAdjacency(nodes, edges);
  const pos: Record<string, { x: number; y: number }> = {};
  let offsetX = 0;
  roots.forEach((root) => {
    const w = subtreeWidth(root, childMap);
    placeTB(root, offsetX + w / 2, 0, childMap, pos);
    offsetX += w + H_GAP * 3;
  });
  return { nodes: applyPositions(nodes, pos), edges: computeEdgeHandles(edges, pos) };
}

//  Left-Right Tree 

function placeLR(
  id: string, x: number, cy: number,
  childMap: Record<string, string[]>,
  pos: Record<string, { x: number; y: number }>,
) {
  pos[id] = { x, y: cy - NODE_H / 2 };
  const kids = childMap[id] ?? [];
  if (!kids.length) return;
  const heights = kids.map((c) => subtreeHeight(c, childMap));
  const total = heights.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP;
  let y = cy - total / 2;
  kids.forEach((child, i) => {
    placeLR(child, x + NODE_W + V_GAP, y + heights[i] / 2, childMap, pos);
    y += heights[i] + H_GAP;
  });
}

export function layoutTreeLR(nodes: Node[], edges: Edge[]): LayoutResult {
  const { childMap, roots } = buildAdjacency(nodes, edges);
  const pos: Record<string, { x: number; y: number }> = {};
  let offsetY = 0;
  roots.forEach((root) => {
    const h = subtreeHeight(root, childMap);
    placeLR(root, 0, offsetY + h / 2, childMap, pos);
    offsetY += h + V_GAP * 3;
  });
  return { nodes: applyPositions(nodes, pos), edges: computeEdgeHandles(edges, pos) };
}

//  Radial / Spider 

export function layoutRadial(nodes: Node[], edges: Edge[]): LayoutResult {
  if (!nodes.length) return { nodes, edges };
  const { childMap, roots } = buildAdjacency(nodes, edges);
  const root = roots[0] ?? nodes[0].id;
  const pos: Record<string, { x: number; y: number }> = {};

  const levelOf: Record<string, number> = { [root]: 0 };
  const angleRange: Record<string, [number, number]> = { [root]: [0, 2 * Math.PI] };
  const visited = new Set([root]);
  const queue = [root];

  while (queue.length) {
    const id = queue.shift()!;
    const kids = (childMap[id] ?? []).filter((c) => !visited.has(c));
    const [aStart, aEnd] = angleRange[id];
    const aSpan = (aEnd - aStart) / Math.max(kids.length, 1);
    kids.forEach((child, i) => {
      visited.add(child);
      levelOf[child] = (levelOf[id] ?? 0) + 1;
      angleRange[child] = [aStart + i * aSpan, aStart + (i + 1) * aSpan];
      queue.push(child);
    });
  }

  nodes.forEach((n) => {
    const level = levelOf[n.id] ?? 0;
    if (level === 0) { pos[n.id] = { x: -NODE_W / 2, y: -NODE_H / 2 }; return; }
    const [aS, aE] = angleRange[n.id];
    const angle = (aS + aE) / 2;
    const radius = RADIAL_BASE * level;
    pos[n.id] = { x: Math.cos(angle) * radius - NODE_W / 2, y: Math.sin(angle) * radius - NODE_H / 2 };
  });

  return { nodes: applyPositions(nodes, pos), edges: computeEdgeHandles(edges, pos) };
}

//  Classic Mind Map (balanced left / right) 

function placeSide(
  id: string, x: number, cy: number, dir: 1 | -1,
  childMap: Record<string, string[]>,
  pos: Record<string, { x: number; y: number }>,
) {
  pos[id] = { x, y: cy - NODE_H / 2 };
  const kids = childMap[id] ?? [];
  if (!kids.length) return;
  const heights = kids.map((c) => subtreeHeight(c, childMap));
  const total = heights.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP;
  let y = cy - total / 2;
  kids.forEach((child, i) => {
    placeSide(child, x + dir * (NODE_W + V_GAP), y + heights[i] / 2, dir, childMap, pos);
    y += heights[i] + H_GAP;
  });
}

export function layoutMindMap(nodes: Node[], edges: Edge[]): LayoutResult {
  if (!nodes.length) return { nodes, edges };
  const { childMap, roots } = buildAdjacency(nodes, edges);
  const root = roots[0] ?? nodes[0].id;
  const pos: Record<string, { x: number; y: number }> = {};
  pos[root] = { x: 0, y: 0 };

  const kids = childMap[root] ?? [];
  const right = kids.filter((_, i) => i % 2 === 0);
  const left  = kids.filter((_, i) => i % 2 === 1);

  const rHeights = right.map((c) => subtreeHeight(c, childMap));
  const rTotal = rHeights.reduce((a, b) => a + b, 0) + Math.max(0, right.length - 1) * H_GAP;
  let ry = -rTotal / 2;
  right.forEach((child, i) => {
    placeSide(child, NODE_W + V_GAP, ry + rHeights[i] / 2, 1, childMap, pos);
    ry += rHeights[i] + H_GAP;
  });

  const lHeights = left.map((c) => subtreeHeight(c, childMap));
  const lTotal = lHeights.reduce((a, b) => a + b, 0) + Math.max(0, left.length - 1) * H_GAP;
  let ly = -lTotal / 2;
  left.forEach((child, i) => {
    placeSide(child, -(NODE_W + V_GAP), ly + lHeights[i] / 2, -1, childMap, pos);
    ly += lHeights[i] + H_GAP;
  });

  return { nodes: applyPositions(nodes, pos), edges: computeEdgeHandles(edges, pos) };
}

//  Fishbone (Ishikawa) 

export function layoutFishbone(nodes: Node[], edges: Edge[]): LayoutResult {
  if (!nodes.length) return { nodes, edges };
  const { childMap, roots } = buildAdjacency(nodes, edges);
  const root = roots[0] ?? nodes[0].id;
  const pos: Record<string, { x: number; y: number }> = {};

  const primaryKids = childMap[root] ?? [];
  const SPINE_GAP = NODE_W + 80;
  const BRANCH_LEN = 160;
  const BRANCH_ANGLE = Math.PI / 4;

  pos[root] = { x: 0, y: 0 };

  primaryKids.forEach((kid, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const xi = -(primaryKids.length / 2 - i - 0.5) * SPINE_GAP;
    const yi = side * BRANCH_LEN * Math.sin(BRANCH_ANGLE);
    pos[kid] = { x: xi - NODE_W / 2, y: yi - NODE_H / 2 };

    const secondaryKids = childMap[kid] ?? [];
    secondaryKids.forEach((sk, j) => {
      pos[sk] = {
        x: xi + (j + 1) * (NODE_W + 20) - NODE_W / 2,
        y: yi + side * (j + 1) * (NODE_H + 20) - NODE_H / 2,
      };
    });
  });

  nodes.forEach((n) => {
    if (!pos[n.id]) pos[n.id] = { x: Math.random() * 300, y: 200 };
  });

  return { nodes: applyPositions(nodes, pos), edges: computeEdgeHandles(edges, pos) };
}
