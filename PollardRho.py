import time
import math


def g(x, n):
    return (x ** 2 + 1) % n


def euclidgcd(a, b):
    while b != 0:
        (a, b) = (b, a % b)

    return a


n = 42457395283988284062221892490694383667  # Try to factor this value. n can be changed, but this value will take about 3 hours on a fast processor.

print(len(bin(n)) - 2, 'bit n')
print('About 10^' + str(round(math.log10(n))))

x = 2
y = 2
d = 1

start = time.time()
while d == 1:
    x = g(x, n)
    y = g(g(y, n), n)
    d = euclidgcd(abs(x - y), n)

if d == n:
    print('Failure')
else:
    print('First factor:', d)

print('Took', time.time() - start, 'seconds.')
