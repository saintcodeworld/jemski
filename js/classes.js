class Sprite {
  constructor({
    position,
    imageSrc,
    scale = 1,
    framesMax = 1,
    offset = { x: 0, y: 0 }
  }) {
    this.position = position
    this.width = 50
    this.height = 150
    this.image = new Image()
    this.image.src = imageSrc
    this.scale = scale
    this.framesMax = framesMax
    this.framesCurrent = 0
    this.framesElapsed = 0
    this.framesHold = 5
    this.offset = offset
  }

  draw() {
    if (!this.image.complete || this.image.naturalWidth === 0) return
    c.drawImage(
      this.image,
      this.framesCurrent * (this.image.width / this.framesMax),
      0,
      this.image.width / this.framesMax,
      this.image.height,
      this.position.x - this.offset.x,
      this.position.y - this.offset.y,
      (this.image.width / this.framesMax) * this.scale,
      this.image.height * this.scale
    )
  }

  animateFrames() {
    this.framesElapsed++

    if (this.framesElapsed % this.framesHold === 0) {
      if (this.framesCurrent < this.framesMax - 1) {
        this.framesCurrent++
      } else {
        this.framesCurrent = 0
      }
    }
  }

  update() {
    this.draw()
    this.animateFrames()
  }
}

class Fighter extends Sprite {
  constructor({
    position,
    velocity,
    color = 'red',
    imageSrc,
    scale = 1,
    framesMax = 1,
    offset = { x: 0, y: 0 },
    sprites,
    attackBox = { offset: {}, width: undefined, height: undefined }
  }) {
    super({
      position,
      imageSrc,
      scale,
      framesMax,
      offset
    })

    this.velocity = velocity
    this.width = 50
    this.height = 150
    this.lastKey
    this.attackBox = {
      position: {
        x: this.position.x,
        y: this.position.y
      },
      offset: attackBox.offset,
      width: attackBox.width,
      height: attackBox.height
    }
    this.color = color
    this.isAttacking
    this.health = 130
    this.framesCurrent = 0
    this.framesElapsed = 0
    this.framesHold = 5
    this.sprites = sprites
    this.dead = false

    for (const sprite in this.sprites) {
      sprites[sprite].image = new Image()
      sprites[sprite].image.src = sprites[sprite].imageSrc
    }
  }

  update() {
    this.draw()
    if (!this.dead) this.animateFrames()

    // attack boxes
    this.attackBox.position.x = this.position.x + this.attackBox.offset.x
    this.attackBox.position.y = this.position.y + this.attackBox.offset.y

    // draw the attack box
    // c.fillRect(
    //   this.attackBox.position.x,
    //   this.attackBox.position.y,
    //   this.attackBox.width,
    //   this.attackBox.height
    // )

    this.position.x += this.velocity.x
    this.position.y += this.velocity.y

    // gravity function
    if (this.position.y + this.height + this.velocity.y >= canvas.height - 76) {
      this.velocity.y = 0
      this.position.y = 350
    } else this.velocity.y += gravity
  }

  attack() {
    this.switchSprite('attack1')
    this.isAttacking = true
  }

  takeHit() {
    this.health -= 20

    if (this.health <= 0) {
      this.switchSprite('death')
    } else this.switchSprite('takeHit')
  }

  switchSprite(sprite) {
    if (this.image === this.sprites.death.image) {
      if (this.framesCurrent === this.sprites.death.framesMax - 1)
        this.dead = true
      return
    }

    // overriding all other animations with the attack animation
    if (
      this.image === this.sprites.attack1.image &&
      this.framesCurrent < this.sprites.attack1.framesMax - 1
    )
      return

    // override when fighter gets hit
    if (
      this.image === this.sprites.takeHit.image &&
      this.framesCurrent < this.sprites.takeHit.framesMax - 1
    )
      return

    switch (sprite) {
      case 'idle':
        if (this.image !== this.sprites.idle.image) {
          this.image = this.sprites.idle.image
          this.framesMax = this.sprites.idle.framesMax
          this.framesCurrent = 0
        }
        break
      case 'run':
        if (this.image !== this.sprites.run.image) {
          this.image = this.sprites.run.image
          this.framesMax = this.sprites.run.framesMax
          this.framesCurrent = 0
        }
        break
      case 'jump':
        if (this.image !== this.sprites.jump.image) {
          this.image = this.sprites.jump.image
          this.framesMax = this.sprites.jump.framesMax
          this.framesCurrent = 0
        }
        break

      case 'fall':
        if (this.image !== this.sprites.fall.image) {
          this.image = this.sprites.fall.image
          this.framesMax = this.sprites.fall.framesMax
          this.framesCurrent = 0
        }
        break

      case 'attack1':
        if (this.image !== this.sprites.attack1.image) {
          this.image = this.sprites.attack1.image
          this.framesMax = this.sprites.attack1.framesMax
          this.framesCurrent = 0
        }
        break

      case 'takeHit':
        if (this.image !== this.sprites.takeHit.image) {
          this.image = this.sprites.takeHit.image
          this.framesMax = this.sprites.takeHit.framesMax
          this.framesCurrent = 0
        }
        break

      case 'death':
        if (this.image !== this.sprites.death.image) {
          this.image = this.sprites.death.image
          this.framesMax = this.sprites.death.framesMax
          this.framesCurrent = 0
        }
        break
    }
  }
}

class SingleImageFighter extends Fighter {
  constructor({
    position,
    velocity,
    color = 'red',
    imageSrc,
    scale = 1,
    offset = { x: 0, y: 0 },
    attackBox = { offset: {}, width: undefined, height: undefined },
    facingRight = true,
    naturalFacesRight = true,
    attackStyle = 'body-swing'
  }) {
    const sprites = {
      idle:    { imageSrc, framesMax: 1 },
      run:     { imageSrc, framesMax: 1 },
      jump:    { imageSrc, framesMax: 1 },
      fall:    { imageSrc, framesMax: 1 },
      attack1: { imageSrc, framesMax: 1 },
      takeHit: { imageSrc, framesMax: 1 },
      death:   { imageSrc, framesMax: 1 }
    }

    super({ position, velocity, color, imageSrc, scale, framesMax: 1, offset, sprites, attackBox })

    this.currentSpriteName = 'idle'
    this.hitFlashTimer = 0
    this.deathAlpha = 1
    this.breatheTime = Math.random() * Math.PI * 2
    this.facingRight = facingRight
    this.naturalFacesRight = naturalFacesRight
    this.attackTimer = 0
    this.takeHitTimer = 0
    this.attackStyle = attackStyle
  }

  draw() {
    const imgW = this.image.width * this.scale
    const imgH = this.image.height * this.scale
    const imgX = this.position.x - this.offset.x
    const imgY = this.position.y - this.offset.y

    // ── Shadow ──────────────────────────────────────────
    const groundY = canvas.height - 76
    const jumpH = Math.max(0, groundY - (this.position.y + this.height))
    const shadowAlpha = Math.max(0, 0.32 - jumpH * 0.0018)
    const shadowRx = imgW * Math.max(0.3, 1 - jumpH * 0.003) * 0.38
    c.save()
    c.globalAlpha = shadowAlpha
    c.fillStyle = '#000'
    c.beginPath()
    c.ellipse(imgX + imgW / 2, groundY + 4, shadowRx, 7, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()

    // ── Character (with state transforms) ───────────────
    c.save()

    if (this.currentSpriteName === 'death') {
      c.globalAlpha = Math.max(0, this.deathAlpha)
    }

    // Horizontal flip when visual direction differs from natural image direction
    if (this.facingRight !== this.naturalFacesRight) {
      const cx = imgX + imgW / 2
      c.translate(cx, 0)
      c.scale(-1, 1)
      c.translate(-cx, 0)
    }

    this._applyStateTransform(imgX, imgY, imgW, imgH)

    c.drawImage(this.image, imgX, imgY, imgW, imgH)

    if (this.hitFlashTimer > 0) {
      c.globalAlpha = (this.hitFlashTimer / 10) * 0.5
      c.fillStyle = '#ff2200'
      c.fillRect(imgX + imgW * 0.1, imgY + imgH * 0.05, imgW * 0.8, imgH * 0.9)
      this.hitFlashTimer--
    }

    c.restore()

    // ── Slash arc (world space, after restore) ───────────
    if (this.currentSpriteName === 'attack1' && this.attackTimer > 0) {
      const progress = (28 - this.attackTimer) / 28
      this._drawSlashArc(imgX, imgY, imgW, imgH, progress)
    }
  }

  _applyStateTransform(imgX, imgY, imgW, imgH) {
    const state = this.currentSpriteName

    if (state === 'idle') {
      this.breatheTime += 0.04
      const bs = 1 + Math.sin(this.breatheTime) * 0.018
      const cx = imgX + imgW / 2, cy = imgY + imgH / 2
      c.translate(cx, cy); c.scale(bs, bs); c.translate(-cx, -cy)
      return
    }

    if (state === 'run') {
      c.translate(0, Math.sin(Date.now() * 0.015) * 3)
      return
    }

    if (state === 'jump') {
      const cx = imgX + imgW / 2, cy = imgY + imgH / 2
      c.translate(cx, cy); c.scale(0.94, 1.07); c.translate(-cx, -cy)
      return
    }

    if (state === 'fall') {
      const cx = imgX + imgW / 2, cy = imgY + imgH / 2
      c.translate(cx, cy); c.scale(1.06, 0.94); c.translate(-cx, -cy)
      return
    }

    if (state === 'takeHit') {
      c.translate(-10, 0)  // flip handles visual direction
      return
    }

    if (state === 'attack1' && this.attackTimer > 0) {
      const progress = (28 - this.attackTimer) / 28

      let angleDeg = 0
      if (progress < 0.3) {
        angleDeg = -18 * (progress / 0.3)
      } else if (progress < 0.7) {
        angleDeg = -18 + 38 * ((progress - 0.3) / 0.4)
      } else {
        angleDeg = 20 * (1 - (progress - 0.7) / 0.3)
      }

      const angle = angleDeg * Math.PI / 180  // flip handles visual direction
      const pivotX = imgX + imgW / 2
      const pivotY = imgY + imgH
      c.translate(pivotX, pivotY)
      c.rotate(angle)
      c.translate(-pivotX, -pivotY)
    }
  }

  _drawSlashArc(imgX, imgY, imgW, imgH, progress) {
    if (progress < 0.25 || progress > 0.88) return

    const swingP = Math.min(1, (progress - 0.25) / 0.6)
    const dir = this.facingRight ? 1 : -1

    const cx = imgX + imgW * (this.facingRight ? 0.62 : 0.38)
    const cy = imgY + imgH * 0.22
    const r = imgW * 0.65

    const startAngle = this.facingRight ? -Math.PI * 0.82 : -Math.PI * 0.18
    const sweep = Math.PI * 1.0 * dir * swingP
    const endAngle = startAngle + sweep
    const ccw = !this.facingRight

    c.save()
    c.lineCap = 'round'

    // 4 layered arcs — wide+dim to thin+bright
    const layers = [
      { lw: 14, alpha: 0.18 },
      { lw: 9,  alpha: 0.35 },
      { lw: 5,  alpha: 0.55 },
      { lw: 2,  alpha: 0.85 }
    ]
    const fade = 1 - Math.max(0, swingP - 0.7) / 0.3

    layers.forEach(({ lw, alpha }) => {
      c.globalAlpha = alpha * fade
      c.strokeStyle = `hsl(48, 100%, 88%)`
      c.lineWidth = lw
      c.beginPath()
      c.arc(cx, cy, r, startAngle, endAngle, ccw)
      c.stroke()
    })

    // Impact spark at tip when swing is near end
    if (swingP > 0.62) {
      const spark = (swingP - 0.62) / 0.38
      const tipX = cx + Math.cos(endAngle) * r
      const tipY = cy + Math.sin(endAngle) * r
      const grad = c.createRadialGradient(tipX, tipY, 0, tipX, tipY, 28 * spark)
      grad.addColorStop(0, `rgba(255,255,220,${spark * 0.95})`)
      grad.addColorStop(0.4, `rgba(255,220,80,${spark * 0.5})`)
      grad.addColorStop(1, `rgba(255,180,0,0)`)
      c.globalAlpha = 1
      c.fillStyle = grad
      c.beginPath()
      c.arc(tipX, tipY, 28 * spark, 0, Math.PI * 2)
      c.fill()
    }

    c.restore()
  }

  update() {
    if (this.attackTimer > 0) {
      this.attackTimer--
      if (this.attackTimer === 0) {
        this.isAttacking = false
        if (this.currentSpriteName === 'attack1') this.currentSpriteName = 'idle'
      }
    }

    if (this.takeHitTimer > 0) {
      this.takeHitTimer--
      if (this.takeHitTimer === 0 && this.currentSpriteName === 'takeHit') {
        this.currentSpriteName = 'idle'
      }
    }

    if (this.currentSpriteName === 'death') {
      this.deathAlpha -= 0.012
      if (this.deathAlpha <= 0) {
        this.dead = true
        this.deathAlpha = 0
      }
    }

    this.draw()

    this.attackBox.position.x = this.position.x + this.attackBox.offset.x
    this.attackBox.position.y = this.position.y + this.attackBox.offset.y

    this.position.x += this.velocity.x
    this.position.y += this.velocity.y

    if (this.position.x < 0) this.position.x = 0
    if (this.position.x + this.width > canvas.width) this.position.x = canvas.width - this.width

    if (this.position.y + this.height + this.velocity.y >= canvas.height - 76) {
      this.velocity.y = 0
      this.position.y = 350
    } else this.velocity.y += gravity
  }

  attack() {
    this.currentSpriteName = 'attack1'
    this.isAttacking = true
    this.attackTimer = 28
  }

  takeHit() {
    this.hitFlashTimer = 10
    this.health -= 10
    if (this.health <= 0) {
      this.currentSpriteName = 'death'
    } else {
      this.currentSpriteName = 'takeHit'
      this.takeHitTimer = 18
    }
  }

  switchSprite(sprite) {
    if (this.currentSpriteName === 'death') return
    if (this.currentSpriteName === 'attack1' && this.attackTimer > 0) return
    if (this.currentSpriteName === 'takeHit' && this.takeHitTimer > 0) return
    this.currentSpriteName = sprite
  }
}
