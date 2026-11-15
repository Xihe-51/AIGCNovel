export const hideBrokenImage = (event: Event) => {
	const target = event && (event.target as HTMLElement | null)
	if (target) target.style.visibility = 'hidden'
}
