import React, { useEffect, useRef } from 'react';
import { Route } from '@/features/map/types/map-objects.type';
import { RouteCard } from './RouteCard';

interface Props {
  routes: Route[];
  onRouteSelect: (route: Route) => void; // לחיצה -> פותח מגירה
  onRouteFocus?: (route: Route) => void; // גלילה -> רק מזיז את המפה
}

export const MapRouteCarousel: React.FC<Props> = ({ routes, onRouteSelect, onRouteFocus }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onRouteFocus) return;

    // צופה שמזהה איזה כרטיס נכנס למרכז המסך
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const routeId = entry.target.getAttribute('data-route-id');
            const route = routes.find((r) => r.id === routeId);
            if (route) {
              onRouteFocus(route); // מעדכן את המפה
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.7, // מופעל כשהכרטיס תופס 70% מהאזור
      }
    );

    const cards = container.querySelectorAll('.carousel-item');
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [routes, onRouteFocus]);

  return (
    <div className="relative w-full overflow-visible">
      <div 
        ref={containerRef}
        className="flex overflow-x-auto pb-8 gap-4 px-6 snap-x snap-mandatory hide-scrollbar touch-pan-x"
        style={{ 
          WebkitOverflowScrolling: 'touch', 
          display: 'flex',
          width: '100%'
        }}
      >
        {routes.map((route) => (
          <div 
            key={route.id} 
            data-route-id={route.id}
            className="carousel-item min-w-[85vw] md:min-w-[320px] snap-center shrink-0"
          >
            <RouteCard 
              route={route} 
              onClick={() => onRouteSelect(route)} 
            />
          </div>
        ))}
        <div className="min-w-[20px] shrink-0" />
      </div>
    </div>
  );
};