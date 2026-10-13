export function ErrorText({ error }: { error: string | null }) {
  return error === null ? null : (
    <p className="error" role="alert">
      {error}
    </p>
  );
}
