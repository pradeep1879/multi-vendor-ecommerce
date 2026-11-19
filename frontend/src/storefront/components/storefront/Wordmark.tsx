import { Link } from 'react-router-dom';

export function Wordmark() {
  return (
    <Link to="/" className="store-wordmark" aria-label="Aster Market home">
      aster <i>market</i>
      <span>Good things, thoughtfully found</span>
    </Link>
  );
}
