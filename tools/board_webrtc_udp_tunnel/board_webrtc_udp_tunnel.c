/*
 * board_webrtc_udp_tunnel.c
 * TCP -> UDP tunnel for WebRTC over ADB
 * 
 * Protocol:
 *   - Receives from TCP: [4-byte BE length][UDP payload]
 *   - Forwards to UDP: [UDP payload only]
 *   - Receives from UDP: [raw UDP]
 *   - Forwards to TCP: [4-byte BE length][UDP payload]
 *
 * Usage: board_webrtc_udp_tunnel <tcp_port> <udp_host> <udp_port>
 * Example: board_webrtc_udp_tunnel 18190 127.0.0.1 8189
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/select.h>
#include <signal.h>

#define MAX_PACKET_SIZE 65536
#define MAX_CLIENTS 64

static volatile int g_running = 1;

void sig_handler(int sig) {
    (void)sig;
    g_running = 0;
}

typedef struct client_s {
    int fd;
    int valid;
    struct sockaddr_in udp_addr;
    int udp_sock;
    uint8_t *recv_buf;
    size_t recv_len;
} client_t;

static int set_nonblock(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return -1;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

static int create_udp_sock(const char *host, unsigned short port) {
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) {
        perror("[tunnel] socket(UDP)");
        return -1;
    }

    struct hostent *he = gethostbyname(host);
    if (!he) {
        fprintf(stderr, "[tunnel] Cannot resolve: %s\n", host);
        close(sock);
        return -1;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    memcpy(&addr.sin_addr, he->h_addr_list[0], he->h_length);

    if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("[tunnel] connect(UDP)");
        close(sock);
        return -1;
    }

    return sock;
}

static int create_tcp_server(unsigned short port) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("[tunnel] socket(TCP)");
        return -1;
    }

    int opt = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(port);

    if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("[tunnel] bind(TCP)");
        close(sock);
        return -1;
    }

    if (listen(sock, 10) < 0) {
        perror("[tunnel] listen(TCP)");
        close(sock);
        return -1;
    }

    return sock;
}

int main(int argc, char *argv[]) {
    if (argc != 4) {
        fprintf(stderr, "Usage: %s <tcp_port> <udp_host> <udp_port>\n", argv[0]);
        fprintf(stderr, "  Example: %s 18190 127.0.0.1 8189\n", argv[0]);
        return 1;
    }

    unsigned short tcp_port = (unsigned short)atoi(argv[1]);
    const char *udp_host = argv[2];
    unsigned short udp_port = (unsigned short)atoi(argv[3]);

    if (!tcp_port || !udp_port) {
        fprintf(stderr, "[tunnel] Invalid port number\n");
        return 1;
    }

    signal(SIGPIPE, SIG_IGN);
    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);

    int tcp_sock = create_tcp_server(tcp_port);
    if (tcp_sock < 0) return 1;

    printf("[tunnel] TCP %hu -> UDP %s:%hu\n", tcp_port, udp_host, udp_port);
    fflush(stdout);

    client_t *clients = calloc(MAX_CLIENTS, sizeof(client_t));
    if (!clients) {
        perror("calloc");
        return 1;
    }

    for (int i = 0; i < MAX_CLIENTS; i++) {
        clients[i].fd = -1;
        clients[i].recv_buf = malloc(MAX_PACKET_SIZE);
        if (!clients[i].recv_buf) {
            perror("malloc");
            return 1;
        }
    }

    uint8_t tmp_buf[MAX_PACKET_SIZE];

    while (g_running) {
        fd_set rfds;
        FD_ZERO(&rfds);
        int maxfd = tcp_sock;
        FD_SET(tcp_sock, &rfds);

        /* Add UDP sockets for reading responses */
        for (int i = 0; i < MAX_CLIENTS; i++) {
            if (clients[i].valid && clients[i].udp_sock >= 0) {
                FD_SET(clients[i].udp_sock, &rfds);
                if (clients[i].udp_sock > maxfd) maxfd = clients[i].udp_sock;
            }
        }

        /* Add TCP client sockets */
        for (int i = 0; i < MAX_CLIENTS; i++) {
            if (clients[i].valid && clients[i].fd >= 0) {
                FD_SET(clients[i].fd, &rfds);
                if (clients[i].fd > maxfd) maxfd = clients[i].fd;
            }
        }

        struct timeval tv = {0, 100000}; /* 100ms */
        int n = select(maxfd + 1, &rfds, NULL, NULL, &tv);
        if (n < 0) {
            if (errno == EINTR) continue;
            perror("select");
            break;
        }
        if (n == 0) continue;

        /* New TCP connection */
        if (FD_ISSET(tcp_sock, &rfds)) {
            struct sockaddr_in cli;
            socklen_t len = sizeof(cli);
            int fd = accept(tcp_sock, (struct sockaddr *)&cli, &len);
            if (fd >= 0) {
                int slot = -1;
                for (int i = 0; i < MAX_CLIENTS; i++) {
                    if (!clients[i].valid) { slot = i; break; }
                }
                if (slot >= 0) {
                    clients[slot].fd = fd;
                    clients[slot].valid = 1;
                    clients[slot].recv_len = 0;
                    
                    /* Create UDP socket for this client */
                    clients[slot].udp_sock = create_udp_sock(udp_host, udp_port);
                    clients[slot].udp_addr.sin_family = AF_INET;
                    clients[slot].udp_addr.sin_port = htons(udp_port);
                    inet_pton(AF_INET, udp_host, &clients[slot].udp_addr.sin_addr);
                    
                    set_nonblock(fd);
                    printf("[tunnel] Client %d connected (TCP fd=%d)\n", slot, fd);
                } else {
                    close(fd);
                    fprintf(stderr, "[tunnel] Max clients reached\n");
                }
            }
            if (--n <= 0) continue;
        }

        /* UDP -> TCP (responses from MediaMTX) */
        for (int i = 0; i < MAX_CLIENTS && n > 0; i++) {
            if (!clients[i].valid || clients[i].udp_sock < 0) continue;
            if (!FD_ISSET(clients[i].udp_sock, &rfds)) continue;

            ssize_t r = recv(clients[i].udp_sock, tmp_buf, MAX_PACKET_SIZE, 0);
            if (r > 0) {
                /* Add 4-byte header and send to TCP */
                uint8_t header[4];
                header[0] = (r >> 24) & 0xFF;
                header[1] = (r >> 16) & 0xFF;
                header[2] = (r >> 8) & 0xFF;
                header[3] = r & 0xFF;
                
                ssize_t w = write(clients[i].fd, header, 4);
                if (w == 4) {
                    write(clients[i].fd, tmp_buf, r);
                }
            }
            n--;
        }

        /* TCP -> UDP (requests from App/relay) */
        for (int i = 0; i < MAX_CLIENTS && n > 0; i++) {
            if (!clients[i].valid || clients[i].fd < 0) continue;
            if (!FD_ISSET(clients[i].fd, &rfds)) continue;

            ssize_t r = read(clients[i].fd, tmp_buf, MAX_PACKET_SIZE);
            if (r <= 0) {
                printf("[tunnel] Client %d disconnected\n", i);
                clients[i].valid = 0;
                if (clients[i].fd >= 0) close(clients[i].fd);
                if (clients[i].udp_sock >= 0) close(clients[i].udp_sock);
                clients[i].fd = -1;
                clients[i].udp_sock = -1;
                clients[i].recv_len = 0;
                n--;
                continue;
            }

            /* Append to recv buffer */
            if (clients[i].recv_len + r > MAX_PACKET_SIZE) {
                clients[i].recv_len = 0; /* Overflow, discard */
                continue;
            }
            memcpy(clients[i].recv_buf + clients[i].recv_len, tmp_buf, r);
            clients[i].recv_len += r;

            /* Process complete frames: [4-byte len][payload] */
            size_t pos = 0;
            while (clients[i].recv_len - pos >= 4) {
                uint32_t plen = (clients[i].recv_buf[pos] << 24) |
                                (clients[i].recv_buf[pos+1] << 16) |
                                (clients[i].recv_buf[pos+2] << 8) |
                                (clients[i].recv_buf[pos+3]);
                
                if (plen == 0 || plen > 65535) {
                    fprintf(stderr, "[tunnel] Invalid frame len %u\n", plen);
                    clients[i].recv_len = 0;
                    break;
                }

                size_t frame_size = 4 + plen;
                if (clients[i].recv_len - pos < frame_size) break; /* Need more */

                /* Forward to UDP (strip header) */
                sendto(clients[i].udp_sock, 
                       clients[i].recv_buf + pos + 4, plen, 0,
                       (struct sockaddr *)&clients[i].udp_addr, 
                       sizeof(clients[i].udp_addr));

                pos += frame_size;
            }

            /* Keep remaining data */
            if (pos > 0 && pos < clients[i].recv_len) {
                memmove(clients[i].recv_buf, clients[i].recv_buf + pos, 
                        clients[i].recv_len - pos);
            }
            clients[i].recv_len -= pos;

            n--;
        }
    }

    printf("[tunnel] Shutdown\n");

    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (clients[i].fd >= 0) close(clients[i].fd);
        if (clients[i].udp_sock >= 0) close(clients[i].udp_sock);
        free(clients[i].recv_buf);
    }
    free(clients);
    close(tcp_sock);

    return 0;
}
