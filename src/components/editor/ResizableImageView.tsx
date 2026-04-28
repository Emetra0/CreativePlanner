import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

type HandleCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const HANDLE_CORNERS: HandleCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function clampWidth(value: number) {
  return Math.max(15, Math.min(100, value));
}

export default function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const width = useMemo(() => {
    const parsed = Number.parseFloat(String(node.attrs.width ?? '100'));
    return Number.isFinite(parsed) ? clampWidth(parsed) : 100;
  }, [node.attrs.width]);

  useEffect(() => {
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  const startResize = (corner: HandleCorner, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const wrapper = wrapperRef.current;
    const container = wrapper?.parentElement;
    if (!wrapper || !container) return;

    const startX = event.clientX;
    const startWidth = width;
    const containerWidth = Math.max(container.clientWidth, 1);
    const direction = corner.includes('left') ? -1 : 1;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = corner === 'top-left' || corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextWidth = clampWidth(startWidth + (deltaX / containerWidth) * 100 * direction);
      updateAttributes({ width: String(Math.round(nextWidth)) });
    };

    const stopResize = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  };

  return (
    <NodeViewWrapper
      as="div"
      className="relative my-3"
      contentEditable={false}
      ref={wrapperRef}
      style={{ width: `${width}%`, maxWidth: '100%' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || ''}
        draggable={false}
        className={`block h-auto w-full rounded-lg border object-contain transition-shadow ${selected ? 'border-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.2)]' : 'border-gray-200 dark:border-gray-700'}`}
      />
      {(isHovered || selected) && HANDLE_CORNERS.map((corner) => {
        const positionClass =
          corner === 'top-left'
            ? '-left-2 -top-2 cursor-nwse-resize'
            : corner === 'top-right'
              ? '-right-2 -top-2 cursor-nesw-resize'
              : corner === 'bottom-left'
                ? '-bottom-2 -left-2 cursor-nesw-resize'
                : '-bottom-2 -right-2 cursor-nwse-resize';

        return (
          <button
            key={corner}
            type="button"
            className={`absolute z-10 h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-sm ${positionClass}`}
            onPointerDown={(event) => startResize(corner, event)}
            aria-label={`Resize image from ${corner}`}
            title="Drag to resize"
          />
        );
      })}
    </NodeViewWrapper>
  );
}