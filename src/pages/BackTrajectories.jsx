export default function BackTrajectories() {
  return (
    <iframe
      src={import.meta.env.BASE_URL + 'back-trajectories.html'}
      style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none', display: 'block' }}
      title="Back Trajectories"
    />
  );
}
