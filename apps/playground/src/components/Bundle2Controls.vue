<template>
  <section class="controls2" aria-label="묶음 2 정상 대조군">
    <button class="controls2__ring" type="button">box-shadow 로 포커스를 표시하는 버튼</button>
    <button class="controls2__pointer" type="button">cursor: pointer 인 진짜 버튼</button>
    <div class="controls2__role" role="button" tabindex="0">role=button 과 tabindex=0 이 있는 div</div>
    <label class="controls2__label" for="controls2-check">라벨은 네이티브로 클릭됩니다</label>
    <input id="controls2-check" type="checkbox" />
    <div class="controls2__wrap">
      <button class="controls2__under" type="button">장식 레이어가 있어도 눌리는 버튼</button>
      <span class="controls2__decor" />
    </div>
    <nav class="controls2__menu" aria-label="포커스로도 열리는 메뉴">
      <p class="controls2__menu-label">메뉴</p>
      <ul class="controls2__menu-list">
        <li><a class="controls2__menu-link" href="/tops">상의</a></li>
      </ul>
    </nav>
  </section>
</template>

<style lang="scss" scoped>
// [정상 대조군] 묶음 2 규칙들이 정상 상태를 결함으로 잡지 않는지 확인한다. 이 파일에서 무엇이든 탐지되면 오탐이다
.controls2 {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  &__ring {
    height: 44px;
    outline: none;

    // 고대비(forced-colors)에서는 box-shadow 가 사라지므로 transparent outline 을 함께 둔다(고대비에서는 시스템 색으로 보인다)
    &:focus-visible {
      outline: 2px solid transparent;
      box-shadow: 0 0 0 3px #0969da;
    }
  }

  &__pointer {
    height: 44px;
    cursor: pointer;
  }

  &__role {
    padding: 12px;
    background: #eaeef2;
    cursor: pointer;
  }

  &__label {
    cursor: pointer;
  }

  &__wrap {
    position: relative;
  }

  &__under {
    height: 44px;
  }

  &__decor {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  &__menu-label {
    margin: 0;
  }

  &__menu-list {
    display: none;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__menu:hover &__menu-list,
  &__menu:focus-within &__menu-list {
    display: block;
  }

  &__menu-link {
    display: inline-block;
    min-height: 32px;
    min-width: 48px;
  }
}
</style>
