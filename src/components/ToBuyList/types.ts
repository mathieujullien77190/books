import type { Book } from '@/types';

export type ToBuyListProps = {
  books: Book[];
  onClose: () => void;
};
