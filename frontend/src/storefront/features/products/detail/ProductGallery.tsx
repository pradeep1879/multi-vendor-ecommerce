import { useState } from 'react';

export function ProductGallery({
  images,
  name,
}: {
  images: Array<{ url: string; alt?: string | null }>;
  name: string;
}) {
  const [active, setActive] = useState(0);
  const image = images[active] ?? images[0];
  return (
    <div className="store-gallery">
      <div className="store-gallery-main">
        {image ? <img src={image.url} alt={image.alt || name} /> : <span>Image unavailable</span>}
      </div>
      {images.length > 1 && (
        <div className="store-gallery-thumbnails" aria-label="Product images">
          {images.map((item, index) => (
            <button
              key={item.url + index}
              onClick={() => setActive(index)}
              aria-pressed={active === index}
              aria-label={`Show image ${index + 1} of ${name}`}
            >
              <img src={item.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
