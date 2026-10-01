// Rebuilds the contact address from the encoded data attributes written by ContactLink.astro.
const decode = (s: string) => [...new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))].reverse().join('');

for (const a of document.querySelectorAll<HTMLAnchorElement>('a.contact-link[data-u][data-d]')) {
  const address = `${decode(a.dataset.u!)}@${decode(a.dataset.d!)}`;
  a.href = `mailto:${address}`;
  if (a.dataset.show) a.textContent = address;
}
