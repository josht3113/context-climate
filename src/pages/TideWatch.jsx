export default function TideWatch() {
  return (
    <iframe
      src={import.meta.env.BASE_URL + 'tide-watch.html'}
      style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none', display: 'block' }}
      title="Tide Watch"
    />
  );
}
