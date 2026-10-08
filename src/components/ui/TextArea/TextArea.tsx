import { cn } from '@/components/ui/cn';
import { FIELD_CLASS } from '@/components/ui/TextInput/constants';

import type { TextAreaProps } from './types';

/** Zone de texte multiligne. */
const TextArea = ({ className, ...rest }: TextAreaProps) => (
  <textarea className={cn(FIELD_CLASS, className)} {...rest} />
);

export default TextArea;
