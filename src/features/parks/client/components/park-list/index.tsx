import ParkItem from '../park-item';
import ParkWithDistance from '../../types/park-with-distance.type';

type ParkListProps = {
  parks: ParkWithDistance[];
};

function ParkList({ parks }: ParkListProps) {
  if (!parks.length) return null;
  return (
    <ul className="px-4 pb-20"> {/* הוספתי padding למטה כדי שהפריט האחרון לא יבלע */}
      {parks.map((park) => (
        <li key={park.id}>
          <ParkItem park={park} />
        </li>
      ))}
    </ul>
  );
}

export default ParkList;