$(function() {
    var ROOT = new Firebase('http://gamma.firebase.com/firebase_news');
    var LINKS = ROOT.child('links');
    var USERS = ROOT.child('users');
    var SORTING_ENABLED = false;
    var editing = null;

    var linkify = function(link) {
        var a = document.createElement('a');
        a.href = link;
        return a.href;
    }

    var handleSubmit = function(event) {
        var btn = $('#submit');
        btn.prop('disabled', true);
        var urlInput = $('#submit-url');
        var titleInput = $('#link-title');
        var link = linkify(urlInput.val());
        var title = titleInput.val() || link;
        urlInput.val('');
        titleInput.val('');
        var data = {
            title: title,
            link: link,
            user: thisUser.name,
            up: [thisUser.ref.toString()],
            down: [],
            comments: []
        };
        var story = LINKS.push(data);
        btn.prop('disabled', false);
    };

    var intCmp = function(a, b) {
        if (a > b) return -1;
        if (a == b) return 0;
        return 1;
    }

    var valWrapper = function(fn) {
        return function(a, b) {
            if (typeof(a.val) == 'function') {
                return fn(a.val(), b.val());
            } else {
                return fn(a, b);
            }
        }
    }

    var upvoteSort = function(a, b) {
        return intCmp((a.up || []).length, (b.up || []).length)
    };

    var totalSort = function(a, b) {
        return intCmp(
            (a.up || []).length - (a.down || []).length,
            (b.up || []).length - (b.down || []).length
        );
    };

    var sortScorable = function(scorables) {
        if (SORTING_ENABLED) {
            scorables.sort(valWrapper(totalSort));
        }
    }

    var sortComments = function(comments) {
        var commentIndex = [];
        $.each(comments, function(index, comment) {
            commentIndex.push({
                i: index,
                up: comment.up || [],
                down: comment.down || []
            });
        });
        if (SORTING_ENABLED) {
            commentIndex.sort(totalSort);
        }
        return commentIndex;
    };

    var ADD_COMMENT_TEMPLATE = _.template($('#add-comment-template').html());
    var COMMENT_TEMPLATE = _.template($('#comment-template').html());
    var renderCommentList = function(ul, comments, parentRef) {
        var commentIndices = sortComments(comments);
        var commentsRef = parentRef.child('comments');
        for (var i = 0; i < commentIndices.length; ++i) {
            var cIndex = commentIndices[i];
            var comment = comments[cIndex.i];
            var refString = commentsRef.child(cIndex.i).toString();
            var li = $(COMMENT_TEMPLATE({
                refString: refString,
                username: thisUser && comment.user == thisUser.name ? "You" : comment.user,
                scoreWidget: scoreElement(comment),
                voteCount: voteCountElement(comment),
                text: comment.text,
                replyWidget: ADD_COMMENT_TEMPLATE({
                    editing: false,
                    canEdit: thisUser != null,
                    title: "Reply"
                })
            }));

            // add next thread
            var nextComments = comment['comments'] || [];
            var nextUl = $('<ul/>');
            renderCommentList(nextUl, nextComments, new Firebase(refString));
            li.append(nextUl);
            ul.append(li);
        }
    };

    var renderComments = function(div, story) {
        div.append($(ADD_COMMENT_TEMPLATE({
            editing: false,
            canEdit: thisUser != null,
            title: "Add Comment"
        })));
        var ul = $('<ul />');
        var comments = story.val().comments || [];
        renderCommentList(ul, comments, story.ref());
        div.append(ul);
    };

    var showCommentsHandler = function(event) {
        event.preventDefault();
        var a = $(event.target);
        var li = a.closest('li');
        var refString = li.attr('id');
        toggleComments(refString);
    };

    var replySubmit = function(event) {
        var btn = $(event.target);
        var commentText = btn.siblings('.comment-text').val();
        var li = btn.closest('li');
        var refString = li.attr('id');
        var comment = {
            text: commentText,
            user: thisUser.name,
            up: [thisUser.ref.toString()]
        };
        new Firebase(refString).child('comments').push(comment);
    };

    var replyHandler = function(event) {
        event.preventDefault();
        var li = $(event.target).closest('li');
        var div = li.find('div.new-comment').first();
        if (editing) {
            //console.log('need to close old editors?');
        }
        editing = div;
        div.html(ADD_COMMENT_TEMPLATE({
            editing: true,
            canEdit: true,
            title: 'reply'
        }));
        $(div).find('.comment-text').focus();
    };

    var toggleComments = function(refString) {
        var li = $('li[id="' + refString + '"]');
        var a = li.find('.comments-opener');

        new Firebase(refString).once('value', function(story) {
            if (a.hasClass('show-comments')) {
                // showing the comments
                a.removeClass('show-comments');
                a.addClass('hide-comments');
                a.text('Hide Comments');

                var div = $('<div />');
                div.addClass('comments');
                li.append(div);
                renderComments(div, story);
            } else {
                // hiding the comments
                a.removeClass('hide-comments');
                a.addClass('show-comments');
                var commentCount = countComments(0, story.val());
                a.text('View Comments (' + commentCount + ')');
                li.children('div.comments').remove();
            }
        });
    };

    var storyAdded = function(snapshot, prevChild) {
        $('#links').append(renderStory(snapshot.val(), snapshot.ref().toString()));
    };

    var storyChanged = function(snapshot, prevChild) {
        var refString = snapshot.ref().toString();
        var li = $('li[id="' + refString + '"]');
        var isOpen = li.find('.show-comments').length == 0;
        li.replaceWith(renderStory(snapshot.val(), refString));
        if (isOpen) toggleComments(refString);
    };

    var callWithVotes = function(fn) {
        return function(scorable) {
            var up = scorable['up'] || [];
            var down = scorable['down'] || [];
            return fn(up, down);
        };
    }

    var SCORE_TEMPLATE = _.template($('#score-element').html());
    var scoreElement = callWithVotes(function(up, down) {
        var voted = null;
        if (thisUser) {
            if (up.indexOf(thisUser.ref.toString()) != -1) voted = 'up';
            else if (down.indexOf(thisUser.ref.toString()) != -1) voted = 'down';
        }
        return SCORE_TEMPLATE({
            voted: voted,
            showVotes: thisUser != null
        });
    });

    var VOTE_COUNT_TEMPLATE = _.template($('#vote-count-template').html());
    var voteCountElement = callWithVotes(function(up, down) {
        var upCount = up.length ? "+" + up.length : "0";
        var downCount = down.length ? "-" + down.length : "0";
        return VOTE_COUNT_TEMPLATE({
            upCount: upCount,
            downCount: downCount
        });
    });

    var siteForLink = function(link) {
        var a = document.createElement('a');
        a.href = link;
        return a.hostname;
    }

    var countComments = function(initial, parent) {
        var comments = parent.comments || {};
        return initial + _.reduce(comments, countComments, _.size(comments));
    }

    var STORY_TEMPLATE = _.template($('#story-template').html());
    var renderStory = function(story_data, refString) {
        // remove it if it exists already
        var score = scoreElement(story_data);
        var voteCount = voteCountElement(story_data);
        var site = siteForLink(story_data.link);
        var li = $(STORY_TEMPLATE({
            scoreWidget: score,
            link: story_data.link,
            title: story_data.title,
            refString: refString,
            voteCount: voteCount,
            site: site,
            commentCount: countComments(0, story_data)
        }));
        return li;
    };

    var renderAll = function() {
        var ul = $('#links');
        LINKS.once('value', function(snapshot) {
            ul.empty();
            var stories = snapshot.val();
            if (_.size(stories)) {
                sortScorable(stories);
                _.each(_.map(stories, function(story_data, key) {
                    return renderStory(story_data, LINKS.child(key).toString());
                }), function(li) {
                    ul.append(li);
                });
            }
        });
    }

    var thisUser = null;
    var handleAuth = function() {
        var login = function(username, remember) {
            $('#login-div').hide();
            $('#submit-div').show();
            $('#user-display').text(username);
            thisUser = {name: username, ref: USERS.child(username)};
            renderAll();
            if (remember) {
                $.cookie('username', username);
            } else {
                $.cookie('username', null);
            }
        };
        $('#login').click(function(event) {
            var username = $('#username').val();
            var remember = typeof($('#remember').attr('checked')) != 'undefined';
            USERS.child(username).transaction(function(userData) {
                if (!userData || remember != userData.remember) {
                    return {remember: remember};
                }
            }, function(success) {
                login(username, remember);
            });
        });
        $('#submit-div').hide();
        var cookiedUser = $.cookie('username');
        if (cookiedUser) {
            login(cookiedUser, true);
        }
    };

    var logout = function() {
        $('#login-div').show();
        $('#submit-div').hide();
        $.cookie('username', null);
        thisUser = null;
        renderAll();
    };

    var removeVote = function(listNode, userRef) {
        listNode.transaction(function(listData) {
            var index = listData.indexOf(userRef);
            if (index != -1) {
                listData.splice(index, 1);
            }
            return listData;
        }, function(success) {
            if (!success) console.warn('removing a vote failed');
        });
    };

    var addVote = function(listNode, userRef) {
        listNode.transaction(function(listData) {
            if (listData) {
                var index = listData.indexOf(userRef);
                if (index == -1) {
                    listData.push(userRef);
                }
            } else {
                listData = [userRef];
            }
            return listData;
        }, function(success) {
            if (!success) console.warn('voting failed');
        });
    };

    var handleVote = function(event) {
        event.preventDefault();
        var a = $(event.target);
        var isUpvote = a.hasClass('up');
        var li = a.closest('li');
        var refString = li.attr('id');
        var node = new Firebase(refString);
        node.once('value', function(snapshot) {
            var scorable = snapshot.val();
            var userRef = thisUser.ref.toString();
            var addList = isUpvote ? scorable.up || [] : scorable.down || [];
            var removeList = isUpvote ? scorable.down || [] : scorable.up || [];
            var addNode = node.child(isUpvote ? 'up' : 'down');
            if (addList.indexOf(userRef) != -1) {
                // this is just removing a vote
                removeVote(addNode, userRef);
            } else {
                // do the vote
                addVote(addNode, userRef);
                if (removeList.indexOf(userRef) != -1) {
                    // need to remove old vote as well
                    var removeNode = node.child(isUpvote ? 'down' : 'up');
                    removeVote(removeNode, userRef);
                }
            }
        });
    };

    LINKS.on('child_added', storyAdded);
    LINKS.on('child_changed', storyChanged);
    $('#submit').click(handleSubmit);
    $('#logout').click(logout);
    $(document).on('click', '.vote', handleVote);
    $(document).on('click', '.comments-opener', showCommentsHandler);
    $(document).on('click', '.comment-reply', replyHandler);
    $(document).on('click', '.comment-submit', replySubmit);
    $(document).on('keypress', '.comment-text', function(event) {
        if ((event.keyCode || event.which) == '13' && !event.shiftKey) {
            $(event.target).siblings('.comment-submit').click();
        }
    });
    handleAuth();
});
