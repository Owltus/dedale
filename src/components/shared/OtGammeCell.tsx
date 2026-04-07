interface OtGammeCellProps {
  nomGamme: string;
}

export function OtGammeCell({ nomGamme }: OtGammeCellProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{nomGamme}</span>
    </div>
  );
}
