import { Link } from 'react-router-dom';

export function Wordmark() {
  return (
    <Link to="/" className="store-wordmark" aria-label="Maison Beauté home">
      maison <i>beauté</i>
      <span>PARIS · INDIA</span>
    </Link>
  );
}
