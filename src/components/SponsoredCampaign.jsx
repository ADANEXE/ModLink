import { useEffect, useRef } from 'react';

export default function SponsoredCampaign({ campaign, onEvent }) {
  const campaignRef = useRef(null);
  const impressionRecorded = useRef(false);

  useEffect(() => {
    if (!campaignRef.current || !onEvent || impressionRecorded.current) return undefined;
    const recordImpression = () => {
      if (impressionRecorded.current) return;
      impressionRecorded.current = true;
      onEvent(campaign.id, 'impression');
    };
    if (!('IntersectionObserver' in window)) {
      recordImpression();
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        recordImpression();
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(campaignRef.current);
    return () => observer.disconnect();
  }, [campaign.id, onEvent]);

  return (
    <article className="sponsored-placement sponsored-campaign" ref={campaignRef}>
      <span className="sponsored-placement__label">SPONSORED · {campaign.advertiser_name}</span>
      {campaign.media_type === 'image' && (
        <img className="sponsored-campaign__media" src={campaign.media_url} alt="" loading="lazy" />
      )}
      {campaign.media_type === 'video' && (
        <video
          className="sponsored-campaign__media"
          src={campaign.media_url}
          controls
          preload="none"
          playsInline
          aria-label={`${campaign.title} sponsored video`}
        />
      )}
      <h3 className="sponsored-placement__title">{campaign.title}</h3>
      {campaign.description && <p className="sponsored-placement__copy">{campaign.description}</p>}
      <a
        className="sponsored-placement__cta"
        href={campaign.destination_url}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={() => {
          onEvent?.(campaign.id, 'impression');
          onEvent?.(campaign.id, 'click');
        }}
      >
        Learn more ↗
      </a>
    </article>
  );
}
