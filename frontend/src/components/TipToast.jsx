export default function TipToast({ data }) {
  const tierClass = `tip-toast-${data.tier || 'bronze'}`;
  const emoji = data.tier === 'gold' ? '🥇' : data.tier === 'silver' ? '🥈' : '🥉';
  return (
    <div className="tip-toast">
      <div className={`tip-toast-inner ${tierClass}`}>
        {emoji} <strong>{data.from}</strong> tipped <strong>{data.targetName}</strong> {data.amount}pts!
      </div>
    </div>
  );
}
