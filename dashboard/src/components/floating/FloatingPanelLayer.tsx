import React, { useRef } from 'react';
import { useFloatingPanels } from '../../stores/uiStore';
import { FloatingAgentPanel } from './FloatingAgentPanel';

export function FloatingPanelLayer() {
  const floatingPanels = useFloatingPanels();
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={constraintsRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 100 }}
    >
      {floatingPanels.map((panel) => (
        <div key={panel.id} className="pointer-events-auto">
          <FloatingAgentPanel panel={panel} constraintsRef={constraintsRef as React.RefObject<HTMLElement>} />
        </div>
      ))}
    </div>
  );
}