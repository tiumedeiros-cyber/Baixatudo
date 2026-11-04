/** Esqueleto enquanto a página carrega: o mesmo desenho do cabeçalho, da faixa de números e de um painel. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="border-b border-line bg-surface-0">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-5 pt-8 pb-6 lg:px-10">
          <div className="h-3 w-28 animate-pulse bg-surface-3" />
          <div className="h-9 w-72 animate-pulse bg-surface-3" />
          <div className="h-3 w-96 max-w-full animate-pulse bg-surface-2" />
        </div>
      </div>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6 px-5 py-7 lg:px-10 lg:py-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[118px] animate-pulse border border-line bg-surface-1" />
          ))}
        </div>
        <div className="h-72 animate-pulse border border-line bg-surface-1" />
      </div>
    </div>
  );
}
