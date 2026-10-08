import Spinner from '@/components/ui/Spinner';

import type { LoadingOverlayProps } from './types';

/** Voile plein écran avec anneau et message pendant le chargement. */
const LoadingOverlay = ({ message }: LoadingOverlayProps) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#dfe8f2]/90 text-ink backdrop-blur-sm"
  >
    <Spinner />
    <p className="m-0 text-sm font-medium">{message}</p>
  </div>
);

export default LoadingOverlay;
