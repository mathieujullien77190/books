import { cn } from '@/components/ui/cn';
import { FIELD_CLASS } from '@/components/ui/TextInput/constants';

import type { SelectProps } from './types';

/** Liste déroulante native (les `<option>` sont passés en enfants). */
const Select = ({ className, ...rest }: SelectProps) => (
  <select className={cn(FIELD_CLASS, className)} {...rest} />
);

export default Select;
