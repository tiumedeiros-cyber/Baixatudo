/** Prévia que não existe, foi arquivada ou cujo endereço foi digitado errado. Não revela qual dos casos. */
export default function PreviewNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f5f2] px-6 text-center text-[#1d1d1b]" style={{ colorScheme: "light" }}>
      <div className="max-w-sm">
        <p className="text-[13px] font-medium tracking-[0.14em] text-[#6b6a64] uppercase">Prévia</p>
        <h1 className="mt-3 text-[28px] leading-tight font-semibold">Esta prévia não está disponível</h1>
        <p className="mt-3 text-[16px] text-[#55544f]">
          O endereço pode ter sido digitado errado ou a prévia já foi retirada do ar. Peça um novo link a quem enviou.
        </p>
      </div>
    </main>
  );
}
