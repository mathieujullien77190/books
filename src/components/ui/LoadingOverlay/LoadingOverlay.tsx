import ProgressBar from '@/components/ui/ProgressBar';
import Spinner from '@/components/ui/Spinner';

import type { LoadingOverlayProps } from './types';

/** Voile plein écran avec anneau et message pendant le chargement (`bare` : sans fond, pour poser sur un autre décor). */
const LoadingOverlay = ({ message, bare, progress }: LoadingOverlayProps) => (
  <div
    role="status"
    aria-live="polite"
    className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 text-ink ${
      bare ? '' : 'bg-[#dfe8f2]/90 backdrop-blur-sm'
    }`}
  >
    <Spinner />
    <p className="m-0 text-sm font-medium">{progress?.label ?? message}</p>
    {progress && <ProgressBar label={progress.label} value={progress.value} className="w-56" />}
  </div>
);

export default LoadingOverlay;
