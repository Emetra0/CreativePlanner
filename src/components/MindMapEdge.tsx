import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath, getStraightPath, getSmoothStepPath } from 'reactflow';
import { X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useTheme } from 'next-themes';
import { adaptColorForTheme } from '@/lib/colors';

export default function MindMapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const deleteEdge = useStore((state) => state.deleteEdge);
  const mindMapTheme = useStore((state) => state.mindMapTheme);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Adapt the stored edge colour so it stays visible in the current theme
  const rawStroke = mindMapTheme.edge.stroke || '#b1b1b7';
  const edgeStroke = adaptColorForTheme(rawStroke, isDark);

  // Determine path type:
  // 1. Edge specific data (from source node preference)
  // 2. Global theme default
  const pathType = data?.pathType || mindMapTheme.edge.type || 'bezier';

  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  const params = {
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  };

  switch (pathType) {
    case 'straight':
      [edgePath, labelX, labelY] = getStraightPath(params);
      break;
    case 'step':
      [edgePath, labelX, labelY] = getSmoothStepPath({ ...params, borderRadius: 0 });
      break;
    case 'smoothstep':
      [edgePath, labelX, labelY] = getSmoothStepPath(params);
      break;
    case 'bezier':
    default:
      [edgePath, labelX, labelY] = getBezierPath(params);
      break;
  }

  const edgeStyle: React.CSSProperties = {
    stroke: edgeStroke,
    strokeWidth: mindMapTheme.edge.strokeWidth || 2,
    ...(mindMapTheme.edge.strokeDasharray ? { strokeDasharray: mindMapTheme.edge.strokeDasharray } : {}),
    ...style,
  };

  const headline = typeof data?.headline === 'string' ? data.headline.trim() : '';

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          {headline && (
            <div
              className="mb-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200"
              style={{ pointerEvents: 'none' }}
              title={headline}
            >
              {headline}
            </div>
          )}
          <button
            className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 hover:border-red-300 transition-all shadow-sm"
            style={{ 
                opacity: selected ? 1 : 0, 
                pointerEvents: selected ? 'all' : 'none',
                transition: 'opacity 0.2s' 
            }}
            onClick={(event) => {
              event.stopPropagation();
              deleteEdge(id);
            }}
            title="Delete Connection"
          >
            <X size={12} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
