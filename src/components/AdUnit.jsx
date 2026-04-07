jsximport { useEffect } from 'react'

export default function AdUnit() {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch (e) {}
  }, [])

  return (
    <div style={{ margin: '2rem 0' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-7204677737254346"
        data-ad-slot="5331535145"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
