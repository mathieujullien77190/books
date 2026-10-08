import { cn } from '@/components/ui/cn';

import { FIELD_CLASS } from './constants';
import type { TextInputProps } from './types';

/** Champ de saisie d'une ligne (texte, nombre, mot de passe…). */
const TextInput = ({ className, type = 'text', ...rest }: TextInputProps) => (
  <input type={type} className={cn(FIELD_CLASS, className)} {...rest} />
);

export default TextInput;
