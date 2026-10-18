
export function JeticIcon({ size = 20, className }: { size?: number; className?: string }) {
    // viewBox is 14×21, so height = size * (21/14) = size * 1.5
    // fill="currentColor" so the mark follows the surrounding text colour and flips with the theme.
    return (
        <svg width={size} height={size * 1.5} viewBox="0 0 14 21" fill="currentColor" className={className} aria-label="Jetic">
            <path d="M0 0h14v14l-7 7H0v-7h7V7H0V0Z" />
        </svg>
    );
}