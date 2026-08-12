export function normalizeResumeLink(value: string): string | undefined {
  if (value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return undefined;
  const clean = value.trim().replace(/^doi:\s*/i, 'doi:');
  if (!clean || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(clean)) return undefined;
  if (/^tel:/i.test(clean)) {
    const phone = clean.slice(4).replace(/\s/g, '');
    return /^\+?[\d().-]+(?:;ext=\d+)?$/i.test(phone) && /\d/.test(phone)
      ? `tel:${phone}`
      : undefined;
  }
  if (/\s/.test(clean)) return undefined;
  const email = /^[^@\s/:?#]+@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,63}$/u;
  if (/^mailto:/i.test(clean)) {
    const address = clean.slice(7).split('?')[0];
    return email.test(address) ? `mailto:${clean.slice(7)}` : undefined;
  }
  if (email.test(clean)) return `mailto:${clean}`;
  const doi = clean.replace(/^doi:\s*/i, '');
  const destination = /^10\.\d{4,9}\/\S+$/i.test(doi)
    ? `https://doi.org/${doi}`
    : clean.startsWith('//')
      ? `https:${clean}`
      : /^https?:\/\//i.test(clean)
        ? clean
        : /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,63}(?::\d{1,5})?(?:[/?#]|$)/u.test(
              clean,
            )
          ? `https://${clean}`
          : '';
  if (!destination) return undefined;
  try {
    const url = new URL(destination);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return undefined;
    return url.href.length <= 2048 ? url.href : undefined;
  } catch {
    return undefined;
  }
}
