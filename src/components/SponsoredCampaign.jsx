export default function SponsoredCampaign({ campaign }) {
  return (
    <article className="sponsored-placement sponsored-campaign">
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
      <a className="sponsored-placement__cta" href={campaign.destination_url} target="_blank" rel="sponsored noopener noreferrer">
        Learn more ↗
      </a>
    </article>
  );
}
