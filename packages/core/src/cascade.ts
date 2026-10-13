/**
 * 연쇄 결함 판정의 순수 로직. 한 원인이 같은 줄의 뒤쪽 형제를 밖으로 밀어낸 경우, 형제들을 원인 하나로 묶는다.
 * 예) 긴 이름(nowrap)이 flex 줄을 넘치면서 뒤의 배지가 부모 밖으로 밀려남 → 이름이 원인, 배지는 연쇄 결함.
 * DOM 없이 좌표만 받아서 단위 테스트할 수 있다.
 */

export interface CascadeBox {
  left: number
  right: number
  top: number
  bottom: number
}

export interface CascadeEntry<T> {
  item: T
  /** 같은 부모인지 비교할 식별자 (참조 비교) */
  parent: unknown
  box: CascadeBox
  /** 부모 콘텐츠 영역(테두리와 패딩 제외)의 오른쪽 끝 */
  parentContentRight: number
}

export interface CascadeGroup<T> {
  root: T
  cascaded: T[]
}

const overlapsVertically = (a: CascadeBox, b: CascadeBox): boolean => b.top < a.bottom && b.bottom > a.top

/**
 * 같은 부모의 같은 줄에서, 왼쪽부터 보며 뒤쪽 형제가 원인의 부모 콘텐츠 영역 밖에서 시작하면 그 원인의 연쇄 결함으로 묶는다.
 * 연쇄 결함은 먼저 나온 원인에게만 속하고, 묶이지 않은 항목은 각자 원인으로 남는다.
 * shortcut: 같은 줄(세로로 겹침)의 형제만 본다, 줄바꿈된 grid/wrap 레이아웃의 연쇄까지 보려면 흐름 방향을 구분하도록 업그레이드
 */
export const groupCascades = <T>(entries: Array<CascadeEntry<T>>, thresholdPx = 1): Array<CascadeGroup<T>> => {
  const order = entries.map((_, index): number => index).sort((a, b): number => (entries[a]?.box.left ?? 0) - (entries[b]?.box.left ?? 0))
  const claimed = new Set<number>()
  const groups = new Map<number, number[]>()

  for (const rootIndex of order) {
    const root = entries[rootIndex]
    if (!root || claimed.has(rootIndex)) continue
    const cascaded = order.filter((otherIndex): boolean => {
      const other = entries[otherIndex]
      return (
        other !== undefined &&
        otherIndex !== rootIndex &&
        !claimed.has(otherIndex) &&
        other.parent === root.parent &&
        other.box.left > root.box.left &&
        other.box.left >= root.parentContentRight - thresholdPx &&
        overlapsVertically(root.box, other.box)
      )
    })
    for (const index of cascaded) claimed.add(index)
    groups.set(rootIndex, cascaded)
  }

  // 입력 순서를 유지해 돌려준다 (호출한 쪽에서 심각도 순으로 정렬해 둔 경우를 깨지 않는다)
  return entries.flatMap((entry, index): Array<CascadeGroup<T>> =>
    groups.has(index) ? [{ root: entry.item, cascaded: (groups.get(index) ?? []).map((cascadedIndex): T => (entries[cascadedIndex] as CascadeEntry<T>).item) }] : []
  )
}
