# Do not use this implementation in a secure context.

import binascii
import sys

from sympy.ntheory import factorint

sys.stdout.reconfigure(encoding='utf-8')


def euclidgcd(a, b):
    while b != 0:
        (a, b) = (b, a % b)

    return a


def extendedeuclidbezout(a, b):
    old_r = a
    r = b
    old_s = 1
    s = 0
    old_t = 0
    t = 1

    while r != 0:
        quotient = old_r // r
        (old_r, r) = (r, old_r - quotient * r)
        (old_s, s) = (s, old_s - quotient * s)
        (old_t, t) = (t, old_t - quotient * t)

    return old_s, old_t


def euclidlcm(a, b):
    return int(abs(a * b) // euclidgcd(a, b))
	

n = 0x1ff0ff346ecf750b7ad8b76985e25833
e = 65537
c = 0xe99f753a490e46b532684475fdf9393

firstFactor = 3335521795621229243

if n % firstFactor == 0:
	print('First factor is valid.')
	secondFactor = n // firstFactor
	print('n = ', firstFactor, '*',  secondFactor)
	print('n = ', hex(firstFactor), '*', hex(secondFactor))
	
	carmichael = euclidlcm(firstFactor - 1, secondFactor - 1)
	print('λ(n):', hex(carmichael))
	print('Computing private key exponent (d) ≡', str(e) + '^{-1} (mod', hex(carmichael) + ')')
	d = extendedeuclidbezout(e, carmichael)[0] % carmichael
	print('Obtained', hex(d))
	
	m = pow(c, d, n)
	print('Decrypted plaintext, m:', hex(m))
	print('Decrypted plaintext, m:', binascii.unhexlify(hex(m)[2:]).decode())
else:
	print('First factor is invalid, recompute it.')
