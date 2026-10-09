/** Fait télécharger `data` par le navigateur sous le nom `filename` (fichier créé en mémoire, jamais envoyé). */
export const saveFile = (filename: string, data: BlobPart, type: string): void => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
