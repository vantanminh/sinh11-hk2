Câu 55:
tep = "output.txt"
Ten = ["Hà", "Bình", "Quang"]
Diem = [9.5, 6.5, 7.4]

f = open(tep, "w", encoding="UTF-8")

for i in range(len(Ten)):
    print(Ten[i], Diem[i], file=f)

f.close()

Câu 77:
dayso = input('Nhập dãy số, mỗi số cách nhau một dấu cách: ')
A = [int(x) for x in dayso.split()]
print('A = ', A)

n = len(A)

def sapxepchen(A):
    for i in range(1, n):
        value = A[i]
        j = i - 1
        while j >= 0 and A[j] > value:
            A[j+1] = A[j]
            j = j - 1
        A[j+1] = value
        print('Sau vòng ', i, 'thì A = ', A, '=> điểm dừng j = ', j)
        print(' j = ', j)

sapxepchen(A)

Câu 79:
def dem(n):
    count = 0
    k = 2
    while k <= n:
        if n % k == 0:
            count = count + 1
        k = k + 1
    return count

kq = dem(4)
print(kq)

Câu 80:
from time import perf_counter

def LinearSearch(A, K):
    for i in range(len(A)):
        if A[i] == K:
            return i
    return -1

A = [3, 1, 0, 10, 13, 16, 9, 7, 5, 11]

t1 = perf_counter()
# ....................................
t2 = perf_counter()

print("Thời gian tìm kiếm tuần tự: ", t2 - t1)