export async function fetchApiHealth() {
  const response = await fetch('/api/health', {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`API health failed: ${response.status}`);
  }

  return response.json();
}
