# Do not use this implementation in a secure context.

import binascii
import sys

from base64 import b64encode

sys.stdout.reconfigure(encoding='utf-8')


def hextobase64(hexstring):
    return b64encode(binascii.unhexlify(hexstring))


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


p = 66363310316067989734300448083539181084993963328438906538750413268397621629274787795362587303930356670984171633076135105001274034838859609212476286576688221826972289630380053987094155591685107302999198249386207121001133326014620465766819464837047362316667777739520213859839689121203686640385605717333974297337
print('p:', hex(p))

q = 158844201038190503287592913907191389054906639133363494090213234373709302683349332671096971719440958969052757624666080223611584483732085340929303680155316948377087514878962820523071242768967105354743129468964766174107632876137151117756030300299327650377143777812538240591469060368177252681779527887337838613947
print('q:', hex(q))

e = 65537

n = p * q
print('n:', hex(n))
print(len(bin(n)) - 2, 'bit key.')
carmichael = euclidlcm(p - 1, q - 1)
print('λ(n):', hex(carmichael))
print('Computing private key exponent (d) ≡', str(e) + '^{-1} (mod', hex(carmichael) + ')')
d = extendedeuclidbezout(e, carmichael)[0] % carmichael
print('Obtained', hex(d))

plaintext = 'The first mention of Witteric in history was as a conspirator with Sunna [Wikidata], the Arian bishop of Merida, to reestablish Arianism in 589. While Sunna was sent into exile, it is unknown what happened to Witteric.[1]'
print('Plaintext, m:', '0x' + plaintext.encode('ascii').hex())

plaintext = binascii.hexlify(plaintext.encode()).decode()

c = pow(int(plaintext, 16), e, n)
print('Ciphertext, c:', hex(c))

m = pow(c, d, n)
print('Decrypted plaintext, m:', hex(m))
print('Decrypted plaintext, m:', binascii.unhexlify(hex(m)[2:]).decode())
