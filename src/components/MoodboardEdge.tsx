import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer, BaseEdge, useReactFlow } from 'reactflow';
import { X } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';

/**
 * Custom edge for the Moodboard canvas.
 * - Shows a pulsing purple highlight when selected
 * - Renders a ✕ delete button in the centre when selected
 * - Del / Backspace (via ReactFlow deleteKeyCode) also deletes selected edges
 */
export default function MoodboardEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const { t } = useAppTranslation();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { setEdges } = useReactFlow();

  return (
    <>
      {/* Hit-area (wider invisible stroke so the edge is easier to click) */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#7c3aed' : '#a78bfa',
          strokeWidth: selected ? 3 : 1.5,
          strokeDasharray: '5 3',
          filter: selected ? 'drop-shadow(0 0 6px rgba(124,58,237,0.75))' : 'none',
          transition: 'stroke 0.15s, stroke-width 0.15s, filter 0.15s',
        }}
      />

      {/* Delete button — only visible when edge is selected */}
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 10,
            }}
            className="nodrag nopan"
          >
            <button
              onClick={() => setEdges((eds) => eds.filter((e) => e.id !== id))}
              className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-colors border-2 border-white dark:border-gray-800"
              title={t('moodboard.edgeDeleteConnection')}
            >
              <X size={10} className="text-white" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
