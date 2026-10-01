/**
 * Exact rational arithmetic on BigInt. Money never passes through a float:
 * every amount, rate and percentage is a fraction until it is rounded once,
 * at the very end, into minor units.
 */
export class Fraction {
  readonly n: bigint
  readonly d: bigint

  private constructor(n: bigint, d: bigint) {
    if (d === 0n) {
      throw new RangeError('Division by zero')
    }
    if (d < 0n) {
      n = -n
      d = -d
    }
    const g = gcd(n < 0n ? -n : n, d)
    this.n = g > 1n ? n / g : n
    this.d = g > 1n ? d / g : d
  }

  static of(n: bigint | number, d: bigint | number = 1n): Fraction {
    return new Fraction(BigInt(n), BigInt(d))
  }

  static readonly ZERO = Fraction.of(0)
  static readonly ONE = Fraction.of(1)
  static readonly HUNDRED = Fraction.of(100)

  /** Parses a plain decimal such as "11821.18" or "-0.5". */
  static parse(value: string): Fraction {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
    if (!match) {
      throw new SyntaxError(`Not a decimal: ${value}`)
    }
    const [, sign, whole, fraction = ''] = match
    const n = BigInt(whole + fraction) * (sign ? -1n : 1n)
    return new Fraction(n, 10n ** BigInt(fraction.length))
  }

  add(other: Fraction): Fraction {
    return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d)
  }

  sub(other: Fraction): Fraction {
    return new Fraction(this.n * other.d - other.n * this.d, this.d * other.d)
  }

  mul(other: Fraction): Fraction {
    return new Fraction(this.n * other.n, this.d * other.d)
  }

  div(other: Fraction): Fraction {
    return new Fraction(this.n * other.d, this.d * other.n)
  }

  neg(): Fraction {
    return new Fraction(-this.n, this.d)
  }

  isZero(): boolean {
    return this.n === 0n
  }

  isNegative(): boolean {
    return this.n < 0n
  }

  isInteger(): boolean {
    return this.d === 1n
  }

  /** Rounds half away from zero to the given number of decimal places and returns the scaled integer. */
  toScaled(decimals: number): bigint {
    const scaled = this.n * 10n ** BigInt(decimals)
    const q = scaled / this.d
    const r = scaled % this.d
    const twice = (r < 0n ? -r : r) * 2n
    if (twice >= this.d) {
      return scaled < 0n ? q - 1n : q + 1n
    }
    return q
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d)
  }

  toDecimalString(decimals: number): string {
    const scaled = this.toScaled(decimals)
    const negative = scaled < 0n
    const digits = (negative ? -scaled : scaled).toString().padStart(decimals + 1, '0')
    const whole = decimals ? digits.slice(0, -decimals) : digits
    const fraction = decimals ? digits.slice(-decimals) : ''
    return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) {
    ;[a, b] = [b, a % b]
  }
  return a || 1n
}
